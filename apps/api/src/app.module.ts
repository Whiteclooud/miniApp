import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { GalleryModule } from './gallery/gallery.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AvailabilityModule } from './availability/availability.module';
import { BookingRulesModule } from './booking-rules/booking-rules.module';
import { MyAppointmentsModule } from './my-appointments/my-appointments.module';
import { StaffAppointmentDetailModule } from './staff-appointment-detail/staff-appointment-detail.module';
import { StaffAppointmentReviewModule } from './staff-appointment-review/staff-appointment-review.module';
import { StaffAppointmentsModule } from './staff-appointments/staff-appointments.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    GalleryModule,
    BookingRulesModule,
    AvailabilityModule,
    AppointmentsModule,
    MyAppointmentsModule,
    StaffAppointmentsModule,
    StaffAppointmentDetailModule,
    StaffAppointmentReviewModule
  ]
})
export class AppModule {}
