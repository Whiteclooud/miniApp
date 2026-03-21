import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { GalleryModule } from './gallery/gallery.module';
import { BookingRulesModule } from './booking-rules/booking-rules.module';
import { MyAppointmentsModule } from './my-appointments/my-appointments.module';
import { StaffAppointmentsModule } from './staff-appointments/staff-appointments.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    GalleryModule,
    BookingRulesModule,
    MyAppointmentsModule,
    StaffAppointmentsModule
  ]
})
export class AppModule {}
