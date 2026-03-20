import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { GalleryModule } from './gallery/gallery.module';
import { BookingRulesModule } from './booking-rules/booking-rules.module';

@Module({
  imports: [PrismaModule, HealthModule, GalleryModule, BookingRulesModule]
})
export class AppModule {}
