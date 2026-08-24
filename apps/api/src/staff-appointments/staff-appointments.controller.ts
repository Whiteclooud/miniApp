import { Controller, Get, Headers, Query } from '@nestjs/common';
import { AuthService, PERMISSIONS } from '../auth/auth.service';
import { ListStaffAppointmentsQuery } from './dto/list-staff-appointments.query';
import { StaffAppointmentsService } from './staff-appointments.service';

@Controller('api/v1/staff/appointments')
export class StaffAppointmentsController {
  constructor(
    private readonly staffAppointmentsService: StaffAppointmentsService,
    private readonly authService: AuthService
  ) {}

  @Get()
  async listStaffAppointments(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Query() query: ListStaffAppointmentsQuery = {}
  ) {
    const identity = await this.authService.requirePermission(authorization, PERMISSIONS.STAFF_APPOINTMENTS_READ, staffOpenId);
    const items = await this.staffAppointmentsService.listStaffAppointments(
      identity.openId,
      query
    );
    return { items };
  }
}
