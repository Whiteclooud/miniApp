import {
  Body,
  Controller,
  Get,
  Headers,
  Put,
  UnauthorizedException
} from '@nestjs/common';
import { BookingRulesService, UpdateBookingRulesInput } from './booking-rules.service';

function resolveAllowedStaffIds(): string[] {
  const values = [process.env.STAFF_OPEN_IDS, process.env.STAFF_OPEN_ID, 'staff-openid-demo']
    .filter(Boolean)
    .flatMap((value) => `${value}`.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(values)];
}

function assertAllowedStaff(staffOpenId?: string) {
  const normalizedStaffOpenId = `${staffOpenId || ''}`.trim();
  const allowlist = resolveAllowedStaffIds();

  if (!normalizedStaffOpenId || !allowlist.includes(normalizedStaffOpenId)) {
    throw new UnauthorizedException({
      error: 'Staff unauthorized',
      code: 'STAFF_UNAUTHORIZED'
    });
  }
}

@Controller('api/v1/staff/booking-rules')
export class BookingRulesController {
  constructor(private readonly bookingRulesService: BookingRulesService) {}

  @Get()
  async getBookingRules(@Headers('x-staff-openid') staffOpenId?: string) {
    assertAllowedStaff(staffOpenId);
    const item = await this.bookingRulesService.getBookingRules();
    return { item };
  }

  @Put()
  async updateBookingRules(
    @Headers('x-staff-openid') staffOpenId?: string,
    @Body() payload: UpdateBookingRulesInput = {}
  ) {
    assertAllowedStaff(staffOpenId);
    const item = await this.bookingRulesService.updateBookingRules(payload || {});
    return { item };
  }
}
