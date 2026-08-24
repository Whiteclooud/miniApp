import { UnauthorizedException } from '@nestjs/common';

function readOpenIds(...values: Array<string | undefined>) {
  return [...new Set(values.filter(Boolean).flatMap((value) => `${value}`.split(',')).map((value) => value.trim()).filter(Boolean))];
}

function shouldIncludeDemoStaffOpenId() {
  const value = process.env.ALLOW_DEMO_STAFF_OPENID;
  if (value !== undefined) return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  return process.env.NODE_ENV !== 'production';
}

// These lists only bootstrap database roles. They are not the production
// authorization source; every authenticated request reads current DB state.
export function resolveLegacyOwnerIds() {
  return readOpenIds(
    process.env.OWNER_OPEN_IDS,
    process.env.STAFF_OPEN_IDS,
    process.env.STAFF_OPEN_ID,
    shouldIncludeDemoStaffOpenId() ? 'staff-openid-demo' : undefined
  );
}

export function resolveSystemAdminIds() {
  return readOpenIds(process.env.SYSTEM_ADMIN_OPEN_IDS);
}

/** @deprecated Use AuthService.requirePermission for request authorization. */
export function resolveAllowedStaffIds() {
  return resolveLegacyOwnerIds();
}

/** Retained for service input validation after controller authorization. */
export function assertStaffAuthorized(staffOpenId?: string) {
  const normalizedStaffOpenId = `${staffOpenId || ''}`.trim();
  if (!normalizedStaffOpenId) {
    throw new UnauthorizedException({ error: 'Staff unauthorized', code: 'STAFF_UNAUTHORIZED' });
  }
  return normalizedStaffOpenId;
}
