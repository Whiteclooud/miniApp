import { UnauthorizedException } from '@nestjs/common';

export function resolveAllowedStaffIds(): string[] {
  const values = [process.env.STAFF_OPEN_IDS, process.env.STAFF_OPEN_ID, 'staff-openid-demo']
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
