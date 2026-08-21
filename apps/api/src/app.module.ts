import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { GalleryModule } from './gallery/gallery.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AvailabilityModule } from './availability/availability.module';
import { BookingRulesModule } from './booking-rules/booking-rules.module';
import { MyAppointmentsModule } from './my-appointments/my-appointments.module';
import { MyInspirationsModule } from './my-inspirations/my-inspirations.module';
import { StaffAppointmentDetailModule } from './staff-appointment-detail/staff-appointment-detail.module';
import { StaffAppointmentReviewModule } from './staff-appointment-review/staff-appointment-review.module';
import { StaffAppointmentsModule } from './staff-appointments/staff-appointments.module';
import { StaffGalleryModule } from './staff-gallery/staff-gallery.module';
import { UploadsModule } from './uploads/uploads.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    HealthModule,
    GalleryModule,
    BookingRulesModule,
    AvailabilityModule,
    AppointmentsModule,
    MyAppointmentsModule,
    MyInspirationsModule,
    StaffAppointmentsModule,
    StaffAppointmentDetailModule,
    StaffAppointmentReviewModule,
    UploadsModule,
    StaffGalleryModule
  ]
})
export class AppModule {}
