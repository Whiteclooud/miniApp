import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StaffAppointmentsModule } from '../staff-appointments/staff-appointments.module';
import { StaffAppointmentReviewController } from './staff-appointment-review.controller';
import { StaffAppointmentReviewService } from './staff-appointment-review.service';

@Module({
  imports: [PrismaModule, StaffAppointmentsModule],
  controllers: [StaffAppointmentReviewController],
  providers: [StaffAppointmentReviewService]
})
export class StaffAppointmentReviewModule {}
