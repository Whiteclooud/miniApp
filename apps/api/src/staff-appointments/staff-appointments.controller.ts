import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ListStaffAppointmentsQuery } from './dto/list-staff-appointments.query';
import { StaffAppointmentsService } from './staff-appointments.service';

@Controller('api/v1/staff/appointments')
export class StaffAppointmentsController {
  constructor(private readonly staffAppointmentsService: StaffAppointmentsService) {}

  @Get()
  async listStaffAppointments(
    @Headers('x-staff-openid') staffOpenId?: string,
    @Query() query: ListStaffAppointmentsQuery = {}
  ) {
    const items = await this.staffAppointmentsService.listStaffAppointments(staffOpenId, query.status);
    return { items };
  }
}
