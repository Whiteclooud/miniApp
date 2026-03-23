import { Controller, Get, Headers, Param } from '@nestjs/common';
import { StaffAppointmentDetailService } from './staff-appointment-detail.service';

@Controller('api/v1/staff/appointments')
export class StaffAppointmentDetailController {
  constructor(
    private readonly staffAppointmentDetailService: StaffAppointmentDetailService
  ) {}

  @Get(':id')
  async getStaffAppointmentDetail(
    @Headers('x-staff-openid') staffOpenId?: string,
    @Param('id') appointmentId?: string
  ) {
    const item = await this.staffAppointmentDetailService.getStaffAppointmentDetail(
      staffOpenId,
      appointmentId
    );

    return { item };
  }
}
