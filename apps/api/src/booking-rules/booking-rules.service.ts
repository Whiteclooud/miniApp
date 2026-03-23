import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_BOOKING_RULE,
  normalizeClosedDates,
  normalizeDailySlots
} from './booking-rules.shared';

@Injectable()
export class BookingRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async getBookingRules() {
    const row = await this.prisma.bookingRule.findFirst({
      orderBy: {
        updatedAt: 'desc'
      }
    });

    if (!row) {
      return {
        ...DEFAULT_BOOKING_RULE,
        updatedAt: new Date().toISOString()
      };
    }

    return {
      advanceOpenDays: row.advanceOpenDays,
      closedDates: normalizeClosedDates(row.closedDatesJson),
      dailySlots: normalizeDailySlots(row.dailySlotsJson),
      updatedAt: row.updatedAt.toISOString()
    };
  }
}
