import { Injectable } from '@nestjs/common';
import { StaffAppointmentsService } from '../staff-appointments/staff-appointments.service';

@Injectable()
export class StaffAppointmentDetailService {
  constructor(private readonly staffAppointmentsService: StaffAppointmentsService) {}

  async getStaffAppointmentDetail(staffOpenId?: string, appointmentId?: string) {
    return this.staffAppointmentsService.getStaffAppointmentDetail(staffOpenId, appointmentId);
  }
}
