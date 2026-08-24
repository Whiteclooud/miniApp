import { Controller, Get, Headers, Param } from '@nestjs/common';
import { AuthService, PERMISSIONS } from '../auth/auth.service';
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
    const identity = await this.authService.requirePermission(authorization, PERMISSIONS.STAFF_APPOINTMENTS_READ, staffOpenId);
    const items = await this.staffAppointmentDetailService.listStaffAppointmentAuditLogs(
      identity.openId,
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
    const identity = await this.authService.requirePermission(authorization, PERMISSIONS.STAFF_APPOINTMENTS_READ, staffOpenId);
    const item = await this.staffAppointmentDetailService.getStaffAppointmentDetail(
      identity.openId,
      appointmentId
    );

    return { item };
  }
}
