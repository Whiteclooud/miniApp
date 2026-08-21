import {
  Body,
  Controller,
  Get,
  Headers,
  Put
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { assertStaffAuthorized } from '../staff-auth/staff-auth';
import { BookingRulesService, UpdateBookingRulesInput } from './booking-rules.service';

@Controller('api/v1/staff/booking-rules')
export class BookingRulesController {
  constructor(
    private readonly bookingRulesService: BookingRulesService,
    private readonly authService: AuthService
  ) {}

  @Get()
  async getBookingRules(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string
  ) {
    assertStaffAuthorized(await this.authService.resolveStaffOpenId(authorization, staffOpenId));
    const item = await this.bookingRulesService.getBookingRules();
    return { item };
  }

  @Put()
  async updateBookingRules(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Body() payload: UpdateBookingRulesInput = {}
  ) {
    assertStaffAuthorized(await this.authService.resolveStaffOpenId(authorization, staffOpenId));
    const item = await this.bookingRulesService.updateBookingRules(payload);
    return { item };
  }
}
