import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { BookingRulesService } from './booking-rules.service';

function resolveAllowedStaffIds(): string[] {
  const values = [process.env.STAFF_OPEN_IDS, process.env.STAFF_OPEN_ID, 'staff-openid-demo']
    .filter(Boolean)
    .flatMap((value) => `${value}`.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(values)];
}

@Controller('api/v1/staff/booking-rules')
export class BookingRulesController {
  constructor(private readonly bookingRulesService: BookingRulesService) {}

  @Get()
  async getBookingRules(@Headers('x-staff-openid') staffOpenId?: string) {
    const normalizedStaffOpenId = `${staffOpenId || ''}`.trim();
    const allowlist = resolveAllowedStaffIds();

    if (!normalizedStaffOpenId || !allowlist.includes(normalizedStaffOpenId)) {
      throw new UnauthorizedException({
        error: 'Staff unauthorized',
        code: 'STAFF_UNAUTHORIZED'
      });
    }

    const item = await this.bookingRulesService.getBookingRules();
    return { item };
  }
}
