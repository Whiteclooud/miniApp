import { UnauthorizedException } from '@nestjs/common';

function shouldIncludeDemoStaffOpenId() {
  const configuredValue = process.env.ALLOW_DEMO_STAFF_OPENID;

  if (configuredValue !== undefined) {
    return ['1', 'true', 'yes', 'on'].includes(configuredValue.trim().toLowerCase());
  }

  return process.env.NODE_ENV !== 'production';
}

export function resolveAllowedStaffIds(): string[] {
  const values = [
    process.env.STAFF_OPEN_IDS,
    process.env.STAFF_OPEN_ID,
    shouldIncludeDemoStaffOpenId() ? 'staff-openid-demo' : ''
  ]
    .filter(Boolean)
    .flatMap((value) => `${value}`.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(values)];
}

export function assertStaffAuthorized(staffOpenId?: string) {
  const normalizedStaffOpenId = `${staffOpenId || ''}`.trim();
  const allowlist = resolveAllowedStaffIds();

  if (!normalizedStaffOpenId || !allowlist.includes(normalizedStaffOpenId)) {
    throw new UnauthorizedException({
      error: 'Staff unauthorized',
      code: 'STAFF_UNAUTHORIZED'
    });
  }

  return normalizedStaffOpenId;
}
