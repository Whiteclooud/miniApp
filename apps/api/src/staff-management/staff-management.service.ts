import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import {
  Prisma,
  StaffInvitationStatus,
  StaffMemberStatus,
  StaffRole,
  UserRole,
  UserStatus
} from '@prisma/client';
import { AuthIdentity, AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffInvitationDto } from './dto/create-staff-invitation.dto';

const DEFAULT_INVITE_HOURS = 72;
const MAX_INVITE_HOURS = 336;

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function apiRole(role: StaffRole) {
  return role.toLowerCase() as 'staff' | 'owner';
}

@Injectable()
export class StaffManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {}

  async listMembers() {
    const rows = await this.prisma.staffMember.findMany({
      include: { user: true },
      orderBy: [{ status: 'asc' }, { role: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]
    });
    return rows.map((row) => this.toMemberItem(row));
  }

  async disableMember(actor: AuthIdentity, memberId?: string) {
    const normalizedId = `${memberId || ''}`.trim();
    if (!normalizedId) this.throwMemberNotFound();

    return this.prisma.$transaction(async (tx) => {
      // Lock the complete owner set in a stable order before the target row.
      // Concurrent removals therefore cannot each observe the other owner as
      // active and leave the store without an owner.
      const activeOwners = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM staff_members
        WHERE role = 'OWNER' AND status = 'ACTIVE'
        ORDER BY id
        FOR UPDATE
      `;
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM staff_members WHERE id = ${normalizedId} FOR UPDATE
      `;
      const member = locked.length
        ? await tx.staffMember.findUnique({ where: { id: locked[0].id }, include: { user: true } })
        : null;
      if (!member) this.throwMemberNotFound();
      if (member.userId === actor.userId) {
        throw new ConflictException({ error: 'Cannot disable yourself', code: 'CANNOT_DISABLE_SELF' });
      }
      if (member.role === StaffRole.OWNER && !actor.permissions.includes('staff:manage:owners')) {
        throw new ForbiddenException({ error: 'Permission denied', code: 'PERMISSION_DENIED' });
      }
      if (member.status === StaffMemberStatus.DISABLED) return this.toMemberItem(member);
      if (member.role === StaffRole.OWNER) {
        if (activeOwners.length <= 1) {
          throw new ConflictException({ error: 'Cannot disable last active owner', code: 'LAST_ACTIVE_OWNER' });
        }
      }
      const updated = await tx.staffMember.update({
        where: { id: member.id },
        data: {
          status: StaffMemberStatus.DISABLED,
          disabledAt: new Date(),
          disabledByUserId: actor.userId
        },
        include: { user: true }
      });
      return this.toMemberItem(updated);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listInvitations(actor: AuthIdentity) {
    const canManageOwners = actor.permissions.includes('staff:manage:owners');
    const rows = await this.prisma.staffInvitation.findMany({
      where: canManageOwners ? undefined : { role: StaffRole.STAFF },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });
    return this.toInvitationItems(rows);
  }

  async createInvitation(actor: AuthIdentity, payload: CreateStaffInvitationDto = {}) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException({ error: 'Invalid invitation payload', code: 'INVALID_INVITATION_PAYLOAD' });
    }
    const role = this.parseRole(payload.role);
    if (role === StaffRole.OWNER && !actor.permissions.includes('staff:manage:owners')) {
      throw new ForbiddenException({ error: 'Permission denied', code: 'PERMISSION_DENIED' });
    }
    const expiresInHours = payload.expiresInHours === undefined
      ? DEFAULT_INVITE_HOURS
      : Number(payload.expiresInHours);
    if (!Number.isInteger(expiresInHours) || expiresInHours < 1 || expiresInHours > MAX_INVITE_HOURS) {
      throw new BadRequestException({ error: 'Invalid invitation expiry', code: 'INVALID_INVITATION_EXPIRY' });
    }
    const code = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    const row = await this.prisma.staffInvitation.create({
      data: {
        codeHash: sha256(code),
        role,
        expiresAt,
        createdByUserId: actor.userId
      }
    });
    const [item] = await this.toInvitationItems([row]);
    return { item, invite: { code, expiresAt: expiresAt.toISOString() } };
  }

  async revokeInvitation(actor: AuthIdentity, invitationId?: string) {
    const normalizedId = `${invitationId || ''}`.trim();
    if (!normalizedId) this.throwInvitationNotFound();
    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM staff_invitations WHERE id = ${normalizedId} FOR UPDATE
      `;
      const row = locked.length
        ? await tx.staffInvitation.findUnique({ where: { id: locked[0].id } })
        : null;
      if (!row) this.throwInvitationNotFound();
      if (row.role === StaffRole.OWNER && !actor.permissions.includes('staff:manage:owners')) {
        throw new ForbiddenException({ error: 'Permission denied', code: 'PERMISSION_DENIED' });
      }
      if (row.status === StaffInvitationStatus.REDEEMED) {
        throw new ConflictException({ error: 'Invitation already redeemed', code: 'INVITATION_ALREADY_REDEEMED' });
      }
      if (row.status === StaffInvitationStatus.REVOKED) {
        throw new ConflictException({ error: 'Invitation already revoked', code: 'INVITATION_REVOKED' });
      }
      if (row.expiresAt.getTime() <= Date.now()) {
        throw new ConflictException({ error: 'Invitation expired', code: 'INVITATION_EXPIRED' });
      }
      return tx.staffInvitation.update({
        where: { id: row.id },
        data: { status: StaffInvitationStatus.REVOKED, revokedAt: new Date() }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const [item] = await this.toInvitationItems([updated]);
    return item;
  }

  async redeemInvitation(openId: string | undefined, code?: string) {
    const normalizedOpenId = `${openId || ''}`.trim();
    if (!normalizedOpenId) {
      throw new UnauthorizedException({ error: 'Customer unauthorized', code: 'CUSTOMER_UNAUTHORIZED' });
    }
    const normalizedCode = `${code || ''}`.trim();
    if (!normalizedCode || normalizedCode.length > 256) {
      throw new BadRequestException({ error: 'Invalid invitation code', code: 'INVALID_INVITATION_CODE' });
    }
    const codeHash = sha256(normalizedCode);
    const member = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM staff_invitations WHERE code_hash = ${codeHash} FOR UPDATE
      `;
      const invitation = locked.length
        ? await tx.staffInvitation.findUnique({ where: { id: locked[0].id } })
        : null;
      if (!invitation) {
        throw new NotFoundException({ error: 'Invitation not found', code: 'INVITATION_NOT_FOUND' });
      }
      if (invitation.status === StaffInvitationStatus.REDEEMED) {
        throw new ConflictException({ error: 'Invitation already redeemed', code: 'INVITATION_ALREADY_REDEEMED' });
      }
      if (invitation.status === StaffInvitationStatus.REVOKED) {
        throw new ConflictException({ error: 'Invitation revoked', code: 'INVITATION_REVOKED' });
      }
      if (invitation.expiresAt.getTime() <= Date.now()) {
        throw new ConflictException({ error: 'Invitation expired', code: 'INVITATION_EXPIRED' });
      }
      const userRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM users WHERE open_id = ${normalizedOpenId} FOR UPDATE
      `;
      let user = userRows.length
        ? await tx.user.findUnique({ where: { id: userRows[0].id } })
        : null;
      if (!user && process.env.NODE_ENV !== 'production') {
        user = await tx.user.create({
          data: { openId: normalizedOpenId, role: UserRole.CUSTOMER, status: UserStatus.ACTIVE }
        });
      }
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException({ error: 'Customer unauthorized', code: 'CUSTOMER_UNAUTHORIZED' });
      }
      const existing = await tx.staffMember.findUnique({ where: { userId: user.id } });
      if (existing?.status === StaffMemberStatus.ACTIVE) {
        throw new ConflictException({ error: 'Member already active', code: 'MEMBER_ALREADY_ACTIVE' });
      }
      const now = new Date();
      const updatedMember = await tx.staffMember.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          role: invitation.role,
          status: StaffMemberStatus.ACTIVE,
          createdByUserId: invitation.createdByUserId
        },
        update: {
          role: invitation.role,
          status: StaffMemberStatus.ACTIVE,
          createdByUserId: invitation.createdByUserId,
          disabledAt: null,
          disabledByUserId: null
        },
        include: { user: true }
      });
      await tx.staffInvitation.update({
        where: { id: invitation.id },
        data: {
          status: StaffInvitationStatus.REDEEMED,
          redeemedByUserId: user.id,
          redeemedAt: now
        }
      });
      return updatedMember;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const identity = await this.authService.getIdentityForUserId(member.userId);
    if (!identity) {
      throw new UnauthorizedException({ error: 'Session unauthorized', code: 'SESSION_UNAUTHORIZED' });
    }
    return { item: this.toMemberItem(member), user: this.authService.toApiUser(identity) };
  }

  private parseRole(value?: string) {
    if (typeof value !== 'string') {
      throw new BadRequestException({ error: 'Invalid staff role', code: 'INVALID_STAFF_ROLE' });
    }
    const normalized = value.trim().toUpperCase();
    if (normalized !== StaffRole.STAFF && normalized !== StaffRole.OWNER) {
      throw new BadRequestException({ error: 'Invalid staff role', code: 'INVALID_STAFF_ROLE' });
    }
    return normalized as StaffRole;
  }

  private toMemberItem(row: any) {
    return {
      id: row.id,
      userId: row.userId,
      openId: row.user?.openId || '',
      displayName: row.user?.displayName || '',
      phone: row.user?.phone || '',
      role: apiRole(row.role),
      status: row.status.toLowerCase(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      disabledAt: row.disabledAt?.toISOString() || ''
    };
  }

  private async toInvitationItems(rows: any[]) {
    const userIds = [...new Set(rows.flatMap((row) => [row.createdByUserId, row.redeemedByUserId]).filter(Boolean))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, openId: true, displayName: true }
        })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));
    return rows.map((row) => ({
      id: row.id,
      role: apiRole(row.role),
      status: row.status === StaffInvitationStatus.PENDING && row.expiresAt.getTime() <= Date.now()
        ? 'expired'
        : row.status.toLowerCase(),
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      redeemedAt: row.redeemedAt?.toISOString() || '',
      revokedAt: row.revokedAt?.toISOString() || '',
      createdBy: this.toActor(byId.get(row.createdByUserId)),
      redeemedBy: row.redeemedByUserId ? this.toActor(byId.get(row.redeemedByUserId)) : null
    }));
  }

  private toActor(user: any) {
    return user
      ? { userId: user.id, openId: user.openId, displayName: user.displayName || '' }
      : { userId: '', openId: '', displayName: '' };
  }

  private throwMemberNotFound(): never {
    throw new NotFoundException({ error: 'Staff member not found', code: 'STAFF_MEMBER_NOT_FOUND' });
  }

  private throwInvitationNotFound(): never {
    throw new NotFoundException({ error: 'Invitation not found', code: 'INVITATION_NOT_FOUND' });
  }
}
