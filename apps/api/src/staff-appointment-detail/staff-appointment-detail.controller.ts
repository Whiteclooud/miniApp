import { Controller, Get, Headers, Param } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { StaffAppointmentDetailService } from './staff-appointment-detail.service';

@Controller('api/v1/staff/appointments')
export class StaffAppointmentDetailController {
  constructor(
    private readonly staffAppointmentDetailService: StaffAppointmentDetailService,
    private readonly authService: AuthService
  ) {}

  @Get(':id/audit-logs')
  async listStaffAppointmentAuditLogs(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Param('id') appointmentId?: string
  ) {
    const resolvedStaffOpenId = await this.authService.resolveStaffOpenId(authorization, staffOpenId);
    const items = await this.staffAppointmentDetailService.listStaffAppointmentAuditLogs(
      resolvedStaffOpenId,
      appointmentId
    );

    return { items };
  }

  @Get(':id')
  async getStaffAppointmentDetail(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Param('id') appointmentId?: string
  ) {
    const resolvedStaffOpenId = await this.authService.resolveStaffOpenId(authorization, staffOpenId);
    const item = await this.staffAppointmentDetailService.getStaffAppointmentDetail(
      resolvedStaffOpenId,
      appointmentId
    );

    return { item };
  }
}
