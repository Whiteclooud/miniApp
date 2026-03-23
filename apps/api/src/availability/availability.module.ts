import { Module } from '@nestjs/common';
import { BookingRulesModule } from '../booking-rules/booking-rules.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';

@Module({
  imports: [PrismaModule, BookingRulesModule],
  controllers: [AvailabilityController],
  providers: [AvailabilityService]
})
export class AvailabilityModule {}
