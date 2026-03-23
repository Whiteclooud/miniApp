import { Module } from '@nestjs/common';
import { StaffAppointmentsModule } from '../staff-appointments/staff-appointments.module';
import { StaffAppointmentDetailController } from './staff-appointment-detail.controller';
import { StaffAppointmentDetailService } from './staff-appointment-detail.service';

@Module({
  imports: [StaffAppointmentsModule],
  controllers: [StaffAppointmentDetailController],
  providers: [StaffAppointmentDetailService]
})
export class StaffAppointmentDetailModule {}
