import { createHash } from 'node:crypto';
import {
  PrismaClient,
  StaffMemberStatus,
  StaffRole,
  UserRole,
  UserStatus,
  UserSystemRole
} from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3100';
const runId = `${Date.now()}`;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_error) {}
  return { status: response.status, json, text };
}

async function createIdentity(label, options = {}) {
  const openId = `rbac-${label}-${runId}`;
  const token = `rbac-${label}-token-${runId}`;
  const user = await prisma.user.create({
    data: {
      openId,
      role: options.staffRole ? UserRole.STAFF : UserRole.CUSTOMER,
      systemRole: options.systemRole || UserSystemRole.USER,
      status: UserStatus.ACTIVE,
      ...(options.staffRole
        ? { staffMembership: { create: { role: options.staffRole, status: StaffMemberStatus.ACTIVE } } }
        : {})
    }
  });
  await prisma.authSession.create({
    data: {
      tokenHash: sha256(token),
      userId: user.id,
      openId,
      role: options.staffRole || options.systemRole === UserSystemRole.SYSTEM_ADMIN
        ? UserRole.STAFF
        : UserRole.CUSTOMER,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    }
  });
  return { user, token, openId };
}

function bearer(identity) {
  return { Authorization: `Bearer ${identity.token}` };
}

function jsonRequest(identity, body, method = 'POST') {
  return { method, headers: { ...bearer(identity), 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

async function main() {
  const cases = [];
  const identities = [];
  const invitationIds = [];
  const preexistingOwners = await prisma.staffMember.findMany({
    where: { role: StaffRole.OWNER, status: StaffMemberStatus.ACTIVE },
    select: { id: true, status: true, disabledAt: true, disabledByUserId: true }
  });
  let preexistingOwnersTemporarilyDisabled = false;
  const runCase = async (name, fn) => {
    const detail = await fn();
    cases.push({ name, ok: true, detail });
  };

  try {
    const customer = await createIdentity('customer');
    const staff = await createIdentity('staff', { staffRole: StaffRole.STAFF });
    const owner = await createIdentity('owner', { staffRole: StaffRole.OWNER });
    const otherOwner = await createIdentity('other-owner', { staffRole: StaffRole.OWNER });
    const admin = await createIdentity('admin', { systemRole: UserSystemRole.SYSTEM_ADMIN });
    const raceCustomerA = await createIdentity('race-customer-a');
    const raceCustomerB = await createIdentity('race-customer-b');
    const revokeRaceCustomer = await createIdentity('revoke-race-customer');
    identities.push(
      customer,
      staff,
      owner,
      otherOwner,
      admin,
      raceCustomerA,
      raceCustomerB,
      revokeRaceCustomer
    );

    await runCase('roles and permissions are returned dynamically', async () => {
      const staffMe = await request('/api/v1/auth/me', { headers: bearer(staff) });
      const ownerMe = await request('/api/v1/auth/me', { headers: bearer(owner) });
      const adminMe = await request('/api/v1/auth/me', { headers: bearer(admin) });
      assert(staffMe.status === 200 && staffMe.json.user.roles.includes('customer'), 'staff must retain customer role');
      assert(!staffMe.json.user.permissions.includes('staff:manage'), 'staff must not manage members');
      assert(ownerMe.json.user.permissions.includes('staff:manage'), 'owner must manage staff');
      assert(adminMe.json.user.permissions.includes('staff:manage:owners'), 'system admin must manage owners');
      return { staff: staffMe.json.user, owner: ownerMe.json.user, admin: adminMe.json.user };
    });

    await runCase('staff cannot manage members or booking rules', async () => {
      const members = await request('/api/v1/staff/members', { headers: bearer(staff) });
      const rules = await request('/api/v1/staff/booking-rules', { headers: bearer(staff) });
      const appointments = await request('/api/v1/staff/appointments', { headers: bearer(staff) });
      const gallery = await request('/api/v1/staff/gallery', { headers: bearer(staff) });
      assert(members.status === 403 && members.json.code === 'PERMISSION_DENIED', 'expected member permission denial');
      assert(rules.status === 403 && rules.json.code === 'PERMISSION_DENIED', 'expected rules permission denial');
      assert(appointments.status === 200, 'staff must read appointments');
      assert(gallery.status === 200, 'staff must manage gallery');
      return { members: members.json, rules: rules.json, appointments: appointments.status, gallery: gallery.status };
    });

    let redeemedMemberId = '';
    await runCase('owner creates one-time STAFF invitation and customer redeems it', async () => {
      const created = await request('/api/v1/staff/invitations', jsonRequest(owner, { role: 'staff', expiresInHours: 336 }));
      assert(created.status === 201, `expected create 201, got ${created.status}: ${created.text}`);
      assert(created.json.invite.code, 'raw code must be returned on create');
      invitationIds.push(created.json.item.id);
      const listed = await request('/api/v1/staff/invitations', { headers: bearer(owner) });
      const listedItem = listed.json.items.find((item) => item.id === created.json.item.id);
      assert(listedItem && !listedItem.code && !listedItem.invite, 'list must not expose raw code');
      const stored = await prisma.staffInvitation.findUnique({ where: { id: created.json.item.id } });
      assert(stored.codeHash === sha256(created.json.invite.code), 'database must contain only code hash');
      assert(stored.codeHash !== created.json.invite.code, 'raw code must not be persisted');

      const redeemed = await request('/api/v1/staff/invitations/redeem', jsonRequest(customer, { code: created.json.invite.code }));
      assert(redeemed.status === 201, `expected redeem 201, got ${redeemed.status}: ${redeemed.text}`);
      assert(redeemed.json.user.primaryRole === 'staff', 'redeem must return updated identity');
      redeemedMemberId = redeemed.json.item.id;

      const me = await request('/api/v1/auth/me', { headers: bearer(customer) });
      assert(me.json.user.primaryRole === 'staff', 'existing token must gain role immediately');
      const again = await request('/api/v1/staff/invitations/redeem', jsonRequest(staff, { code: created.json.invite.code }));
      assert(again.status === 409 && again.json.code === 'INVITATION_ALREADY_REDEEMED', 'invite must be one-time');
      return { create: created.json.item, redeemed: redeemed.json.item, me: me.json.user };
    });

    await runCase('owner cannot grant owner; system admin can', async () => {
      const denied = await request('/api/v1/staff/invitations', jsonRequest(owner, { role: 'owner' }));
      assert(denied.status === 403 && denied.json.code === 'PERMISSION_DENIED', 'owner must not grant owner');
      const created = await request('/api/v1/staff/invitations', jsonRequest(admin, { role: 'owner' }));
      assert(created.status === 201 && created.json.item.role === 'owner', 'admin must create owner invite');
      invitationIds.push(created.json.item.id);
      return { ownerDenied: denied.json, adminCreated: created.json.item };
    });

    await runCase('concurrent redemption succeeds exactly once', async () => {
      const created = await request('/api/v1/staff/invitations', jsonRequest(owner, { role: 'staff' }));
      invitationIds.push(created.json.item.id);
      const results = await Promise.all([
        request('/api/v1/staff/invitations/redeem', jsonRequest(raceCustomerA, { code: created.json.invite.code })),
        request('/api/v1/staff/invitations/redeem', jsonRequest(raceCustomerB, { code: created.json.invite.code }))
      ]);
      const successes = results.filter((result) => result.status === 201);
      const conflicts = results.filter(
        (result) => result.status === 409 && result.json.code === 'INVITATION_ALREADY_REDEEMED'
      );
      assert(successes.length === 1 && conflicts.length === 1, 'exactly one concurrent redeem must succeed');
      const stored = await prisma.staffInvitation.findUnique({ where: { id: created.json.item.id } });
      assert(stored.status === 'REDEEMED' && stored.redeemedByUserId, 'invite must have one redeemer');
      return results.map((result) => ({ status: result.status, code: result.json?.code || '' }));
    });

    await runCase('concurrent revoke and redeem leave one terminal outcome', async () => {
      const created = await request('/api/v1/staff/invitations', jsonRequest(owner, { role: 'staff' }));
      invitationIds.push(created.json.item.id);
      const results = await Promise.all([
        request(`/api/v1/staff/invitations/${created.json.item.id}`, { method: 'DELETE', headers: bearer(owner) }),
        request('/api/v1/staff/invitations/redeem', jsonRequest(revokeRaceCustomer, { code: created.json.invite.code }))
      ]);
      assert(results.filter((result) => result.status >= 200 && result.status < 300).length === 1, 'race must have one success');
      assert(results.filter((result) => result.status === 409).length === 1, 'race loser must receive conflict');
      const stored = await prisma.staffInvitation.findUnique({ where: { id: created.json.item.id } });
      assert(['REDEEMED', 'REVOKED'].includes(stored.status), 'invite must have one terminal status');
      assert(
        stored.status === 'REDEEMED'
          ? !!stored.redeemedByUserId && !stored.revokedAt
          : !!stored.revokedAt && !stored.redeemedByUserId,
        'terminal invitation fields must be internally consistent'
      );
      return {
        results: results.map((result) => ({ status: result.status, code: result.json?.code || '' })),
        finalStatus: stored.status
      };
    });

    await runCase('revoked invitation cannot be redeemed', async () => {
      const created = await request('/api/v1/staff/invitations', jsonRequest(owner, { role: 'staff' }));
      invitationIds.push(created.json.item.id);
      const revoked = await request(`/api/v1/staff/invitations/${created.json.item.id}`, { method: 'DELETE', headers: bearer(owner) });
      assert(revoked.status === 200 && revoked.json.item.status === 'revoked', 'expected revoked invitation');
      const attempted = await request('/api/v1/staff/invitations/redeem', jsonRequest(staff, { code: created.json.invite.code }));
      assert(attempted.status === 409 && attempted.json.code === 'INVITATION_REVOKED', 'revoked invite must fail');
      return { revoked: revoked.json.item, attempted: attempted.json };
    });

    await runCase('expired invitation cannot be redeemed', async () => {
      const created = await request('/api/v1/staff/invitations', jsonRequest(owner, { role: 'staff' }));
      invitationIds.push(created.json.item.id);
      await prisma.staffInvitation.update({
        where: { id: created.json.item.id },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });
      const attempted = await request('/api/v1/staff/invitations/redeem', jsonRequest(staff, { code: created.json.invite.code }));
      assert(attempted.status === 409 && attempted.json.code === 'INVITATION_EXPIRED', 'expired invite must fail');
      return attempted.json;
    });

    await runCase('owner cannot disable self or another owner', async () => {
      const selfMembership = await prisma.staffMember.findUnique({ where: { userId: owner.user.id } });
      const otherMembership = await prisma.staffMember.findUnique({ where: { userId: otherOwner.user.id } });
      const self = await request(`/api/v1/staff/members/${selfMembership.id}`, { method: 'DELETE', headers: bearer(owner) });
      const other = await request(`/api/v1/staff/members/${otherMembership.id}`, { method: 'DELETE', headers: bearer(owner) });
      assert(self.status === 409 && self.json.code === 'CANNOT_DISABLE_SELF', 'owner must not disable self');
      assert(other.status === 403 && other.json.code === 'PERMISSION_DENIED', 'owner must not disable owner');
      return { self: self.json, other: other.json };
    });

    await runCase('concurrent owner removals preserve one active owner', async () => {
      if (preexistingOwners.length) {
        await prisma.staffMember.updateMany({
          where: { id: { in: preexistingOwners.map((item) => item.id) } },
          data: { status: StaffMemberStatus.DISABLED, disabledAt: new Date() }
        });
        preexistingOwnersTemporarilyDisabled = true;
      }
      const otherMembership = await prisma.staffMember.findUnique({ where: { userId: otherOwner.user.id } });
      const ownerMembership = await prisma.staffMember.findUnique({ where: { userId: owner.user.id } });
      const results = await Promise.all([
        request(`/api/v1/staff/members/${otherMembership.id}`, { method: 'DELETE', headers: bearer(admin) }),
        request(`/api/v1/staff/members/${ownerMembership.id}`, { method: 'DELETE', headers: bearer(admin) })
      ]);
      assert(results.filter((result) => result.status === 200).length === 1, 'one owner removal must succeed');
      assert(
        results.filter((result) => result.status === 409 && result.json.code === 'LAST_ACTIVE_OWNER').length === 1,
        'concurrent final owner removal must be rejected'
      );
      const activeOwnerCount = await prisma.staffMember.count({
        where: { role: StaffRole.OWNER, status: StaffMemberStatus.ACTIVE }
      });
      assert(activeOwnerCount === 1, 'exactly one active owner must remain');
      return results.map((result) => ({ status: result.status, code: result.json?.code || '' }));
    });

    await runCase('disable takes effect immediately while customer ability remains', async () => {
      const disabled = await request(`/api/v1/staff/members/${redeemedMemberId}`, { method: 'DELETE', headers: bearer(admin) });
      assert(disabled.status === 200 && disabled.json.item.status === 'disabled', 'expected member disabled');
      const staffAccess = await request('/api/v1/staff/appointments', { headers: bearer(customer) });
      assert(staffAccess.status === 401 && staffAccess.json.code === 'STAFF_UNAUTHORIZED', 'old token must lose staff immediately');
      const customerAccess = await request('/api/v1/my/appointments', { headers: bearer(customer) });
      assert(customerAccess.status === 200, 'disabled membership must retain customer capability');
      return { disabled: disabled.json.item, staffAccess: staffAccess.json, customerStatus: customerAccess.status };
    });

    console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, cases }, null, 2));
  } finally {
    const userIds = identities.map((item) => item.user.id);
    await prisma.staffInvitation.deleteMany({ where: { OR: [{ id: { in: invitationIds } }, { createdByUserId: { in: userIds } }] } });
    await prisma.staffMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (preexistingOwnersTemporarilyDisabled) {
      await Promise.all(preexistingOwners.map((item) => prisma.staffMember.update({
        where: { id: item.id },
        data: {
          status: item.status,
          disabledAt: item.disabledAt,
          disabledByUserId: item.disabledByUserId
        }
      })));
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, baseUrl: BASE_URL, error: `${error?.message || error}` }, null, 2));
  process.exit(1);
});
