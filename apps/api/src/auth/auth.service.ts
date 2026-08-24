import { randomBytes, createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { StaffMemberStatus, StaffRole, UserRole, UserStatus, UserSystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveLegacyOwnerIds, resolveSystemAdminIds } from '../staff-auth/staff-auth';

type WechatCodeSession = {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

export const PERMISSIONS = {
  STAFF_APPOINTMENTS_READ: 'staff:appointments:read',
  STAFF_APPOINTMENTS_WRITE: 'staff:appointments:write',
  STAFF_GALLERY_READ: 'staff:gallery:read',
  STAFF_GALLERY_WRITE: 'staff:gallery:write',
  BOOKING_RULES_READ: 'staff:booking-rules:read',
  BOOKING_RULES_WRITE: 'staff:booking-rules:write',
  STAFF_MANAGE: 'staff:manage',
  STAFF_MANAGE_OWNERS: 'staff:manage:owners',
  SYSTEM_MANAGE: 'system:manage'
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type AuthIdentity = {
  userId: string;
  openId: string;
  role: UserRole;
  primaryRole: 'customer' | 'staff' | 'owner' | 'system_admin';
  roles: string[];
  permissions: Permission[];
  staffRole?: 'staff' | 'owner';
  systemRole: 'user' | 'system_admin';
};

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function resolveSessionTtlMs() {
  const days = Number(process.env.SESSION_EXPIRES_DAYS || 30);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 30;
  return safeDays * 24 * 60 * 60 * 1000;
}

function isWechatAuthConfigured() {
  return !!(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET);
}

function isOpenIdHeaderFallbackEnabled() {
  const configuredValue = process.env.ALLOW_OPENID_HEADER_AUTH;
  if (configuredValue !== undefined) {
    return ['1', 'true', 'yes', 'on'].includes(configuredValue.trim().toLowerCase());
  }
  return process.env.NODE_ENV !== 'production';
}

function rolePermissions(staffRole?: StaffRole, systemRole?: UserSystemRole): Permission[] {
  if (systemRole === UserSystemRole.SYSTEM_ADMIN) return Object.values(PERMISSIONS);
  if (staffRole === StaffRole.OWNER) {
    return [
      PERMISSIONS.STAFF_APPOINTMENTS_READ,
      PERMISSIONS.STAFF_APPOINTMENTS_WRITE,
      PERMISSIONS.STAFF_GALLERY_READ,
      PERMISSIONS.STAFF_GALLERY_WRITE,
      PERMISSIONS.BOOKING_RULES_READ,
      PERMISSIONS.BOOKING_RULES_WRITE,
      PERMISSIONS.STAFF_MANAGE
    ];
  }
  if (staffRole === StaffRole.STAFF) {
    return [
      PERMISSIONS.STAFF_APPOINTMENTS_READ,
      PERMISSIONS.STAFF_APPOINTMENTS_WRITE,
      PERMISSIONS.STAFF_GALLERY_READ,
      PERMISSIONS.STAFF_GALLERY_WRITE
    ];
  }
  return [];
}

function identityRole(primaryRole: AuthIdentity['primaryRole']) {
  return primaryRole === 'customer' ? UserRole.CUSTOMER : UserRole.STAFF;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async loginWithWechat(code?: string) {
    const normalizedCode = `${code || ''}`.trim();
    if (!normalizedCode) {
      throw new BadRequestException({ error: 'Missing login code', code: 'WECHAT_LOGIN_CODE_MISSING' });
    }
    if (!isWechatAuthConfigured()) {
      throw new BadRequestException({ error: 'Wechat auth is not configured', code: 'WECHAT_AUTH_NOT_CONFIGURED' });
    }
    const session = await this.exchangeCodeForSession(normalizedCode);
    const openId = `${session.openid || ''}`.trim();
    if (!openId) {
      throw new UnauthorizedException({ error: 'Wechat login failed', code: 'WECHAT_OPENID_MISSING' });
    }

    const existingUser = await this.prisma.user.findUnique({ where: { openId }, select: { status: true } });
    if (existingUser?.status === UserStatus.DISABLED) {
      throw new UnauthorizedException({ error: 'Account disabled', code: 'ACCOUNT_DISABLED' });
    }
    const user = await this.prisma.user.upsert({
      where: { openId },
      update: {},
      create: { openId, role: UserRole.CUSTOMER, status: UserStatus.ACTIVE }
    });
    await this.applyBootstrapRoles(user.id, openId, user.systemRole);
    const access = await this.loadIdentityByUserId(user.id);
    if (!access) {
      throw new UnauthorizedException({ error: 'Account disabled', code: 'ACCOUNT_DISABLED' });
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + resolveSessionTtlMs());
    await this.prisma.authSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await this.prisma.authSession.create({
      data: { tokenHash: sha256(token), userId: user.id, openId, role: access.role, expiresAt }
    });
    return { token, expiresAt: expiresAt.toISOString(), user: this.toApiUser(access) };
  }

  async logout(authorization?: string) {
    const token = this.resolveBearerToken(authorization);
    if (token) await this.prisma.authSession.deleteMany({ where: { tokenHash: sha256(token) } });
    return { ok: true };
  }

  async getMe(authorization?: string) {
    const identity = await this.resolveIdentityFromAuthorization(authorization);
    if (!identity) {
      throw new UnauthorizedException({ error: 'Session unauthorized', code: 'SESSION_UNAUTHORIZED' });
    }
    return { user: this.toApiUser(identity) };
  }

  toApiUser(identity: AuthIdentity) {
    return {
      id: identity.userId,
      openId: identity.openId,
      role: identity.role.toLowerCase(),
      primaryRole: identity.primaryRole,
      roles: identity.roles,
      permissions: identity.permissions,
      systemRole: identity.systemRole,
      ...(identity.staffRole ? { staffRole: identity.staffRole } : {})
    };
  }

  async resolveIdentityFromAuthorization(authorization?: string): Promise<AuthIdentity | null> {
    const token = this.resolveBearerToken(authorization);
    if (!token) return null;
    const session = await this.prisma.authSession.findUnique({ where: { tokenHash: sha256(token) } });
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    // Session.role is an audit snapshot only. Current membership and system
    // role are loaded on every request so revocation takes effect immediately.
    return this.loadIdentityByUserId(session.userId, session.openId);
  }

  async requirePermission(authorization: string | undefined, permission: Permission, fallbackOpenId?: string) {
    const identity = await this.resolveIdentityFromAuthorization(authorization);
    if (!identity) {
      if (this.resolveBearerToken(authorization)) {
        throw new UnauthorizedException({ error: 'Staff unauthorized', code: 'STAFF_UNAUTHORIZED' });
      }
      const fallback = `${fallbackOpenId || ''}`.trim();
      if (!isOpenIdHeaderFallbackEnabled() || !resolveLegacyOwnerIds().includes(fallback)) {
        throw new UnauthorizedException({ error: 'Staff unauthorized', code: 'STAFF_UNAUTHORIZED' });
      }
      if (permission === PERMISSIONS.STAFF_MANAGE || permission === PERMISSIONS.STAFF_MANAGE_OWNERS || permission === PERMISSIONS.SYSTEM_MANAGE) {
        throw new UnauthorizedException({ error: 'Staff unauthorized', code: 'STAFF_UNAUTHORIZED' });
      }
      const fallbackPermissions = rolePermissions(StaffRole.OWNER).filter(
        (item) => item !== PERMISSIONS.STAFF_MANAGE
      );
      if (!fallbackPermissions.includes(permission)) {
        throw new UnauthorizedException({ error: 'Staff unauthorized', code: 'STAFF_UNAUTHORIZED' });
      }
      return {
        userId: '',
        openId: fallback,
        role: UserRole.STAFF,
        primaryRole: 'owner',
        roles: ['customer', 'staff', 'owner'],
        permissions: fallbackPermissions,
        staffRole: 'owner',
        systemRole: 'user'
      } satisfies AuthIdentity;
    }
    if (!identity.roles.includes('staff')) {
      throw new UnauthorizedException({ error: 'Staff unauthorized', code: 'STAFF_UNAUTHORIZED' });
    }
    if (!identity.permissions.includes(permission)) {
      throw new ForbiddenException({ error: 'Permission denied', code: 'PERMISSION_DENIED' });
    }
    return identity;
  }

  async resolveCustomerOpenId(authorization?: string, fallbackOpenId?: string) {
    const hasBearerToken = !!this.resolveBearerToken(authorization);
    const identity = await this.resolveIdentityFromAuthorization(authorization);
    if (identity) return identity.openId;
    if (hasBearerToken) {
      throw new UnauthorizedException({ error: 'Customer unauthorized', code: 'CUSTOMER_UNAUTHORIZED' });
    }
    return isOpenIdHeaderFallbackEnabled() ? `${fallbackOpenId || ''}`.trim() : '';
  }

  async resolveStaffOpenId(authorization?: string, fallbackOpenId?: string) {
    const identity = await this.resolveIdentityFromAuthorization(authorization);
    if (identity) {
      if (!identity.permissions.includes(PERMISSIONS.STAFF_APPOINTMENTS_READ)) {
        throw new UnauthorizedException({ error: 'Staff unauthorized', code: 'STAFF_UNAUTHORIZED' });
      }
      return identity.openId;
    }
    if (this.resolveBearerToken(authorization)) {
      throw new UnauthorizedException({ error: 'Staff unauthorized', code: 'STAFF_UNAUTHORIZED' });
    }
    const fallback = `${fallbackOpenId || ''}`.trim();
    return isOpenIdHeaderFallbackEnabled() && resolveLegacyOwnerIds().includes(fallback) ? fallback : '';
  }

  async applyBootstrapRoles(userId: string, openId: string, currentSystemRole?: UserSystemRole) {
    const systemBootstrap = resolveSystemAdminIds().includes(openId);
    const ownerBootstrap = resolveLegacyOwnerIds().includes(openId);
    if (systemBootstrap && currentSystemRole !== UserSystemRole.SYSTEM_ADMIN) {
      await this.prisma.user.update({ where: { id: userId }, data: { systemRole: UserSystemRole.SYSTEM_ADMIN, role: UserRole.STAFF } });
    }
    if (ownerBootstrap && !systemBootstrap) {
      // An existing (including disabled) membership is never reactivated by a
      // bootstrap list. That keeps explicit revocation authoritative.
      await this.prisma.staffMember.upsert({
        where: { userId },
        update: {},
        create: { userId, role: StaffRole.OWNER, status: StaffMemberStatus.ACTIVE }
      });
      await this.prisma.user.update({ where: { id: userId }, data: { role: UserRole.STAFF } });
    }
  }

  async getIdentityForUserId(userId: string) {
    return this.loadIdentityByUserId(userId);
  }

  private async loadIdentityByUserId(userId: string, expectedOpenId?: string): Promise<AuthIdentity | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { staffMembership: true } });
    if (!user || user.status !== UserStatus.ACTIVE || (expectedOpenId && expectedOpenId !== user.openId)) return null;
    let membership = user.staffMembership;
    if (!membership && process.env.NODE_ENV !== 'production' && user.role === UserRole.STAFF && resolveLegacyOwnerIds().includes(user.openId)) {
      membership = { role: StaffRole.OWNER, status: StaffMemberStatus.ACTIVE } as any;
    }
    const activeStaffRole = membership?.status === StaffMemberStatus.ACTIVE ? membership.role : undefined;
    const isSystemAdmin = user.systemRole === UserSystemRole.SYSTEM_ADMIN;
    const primaryRole: AuthIdentity['primaryRole'] = isSystemAdmin ? 'system_admin'
      : activeStaffRole === StaffRole.OWNER ? 'owner'
      : activeStaffRole === StaffRole.STAFF ? 'staff' : 'customer';
    const roles = ['customer'];
    if (activeStaffRole || isSystemAdmin) roles.push('staff');
    if (activeStaffRole === StaffRole.OWNER || isSystemAdmin) roles.push('owner');
    if (isSystemAdmin) roles.push('system_admin');
    return {
      userId: user.id,
      openId: user.openId,
      role: identityRole(primaryRole),
      primaryRole,
      roles,
      permissions: rolePermissions(activeStaffRole, user.systemRole),
      ...(activeStaffRole ? { staffRole: activeStaffRole.toLowerCase() as 'staff' | 'owner' } : {}),
      systemRole: isSystemAdmin ? 'system_admin' : 'user'
    };
  }

  private resolveBearerToken(authorization?: string) {
    const match = `${authorization || ''}`.trim().match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
  }

  private async exchangeCodeForSession(code: string): Promise<WechatCodeSession> {
    const params = new URLSearchParams({ appid: `${process.env.WECHAT_APP_ID || ''}`, secret: `${process.env.WECHAT_APP_SECRET || ''}`, js_code: code, grant_type: 'authorization_code' });
    const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`);
    const payload = (await response.json()) as WechatCodeSession;
    if (!response.ok || payload.errcode) {
      throw new UnauthorizedException({ error: 'Wechat login failed', code: 'WECHAT_LOGIN_FAILED', detail: payload.errmsg || `HTTP ${response.status}` });
    }
    return payload;
  }
}
