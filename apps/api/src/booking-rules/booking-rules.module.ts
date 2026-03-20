import { Module } from '@nestjs/common';
import { BookingRulesController } from './booking-rules.controller';
import { BookingRulesService } from './booking-rules.service';

@Module({
  controllers: [BookingRulesController],
  providers: [BookingRulesService]
})
export class BookingRulesModule {}
