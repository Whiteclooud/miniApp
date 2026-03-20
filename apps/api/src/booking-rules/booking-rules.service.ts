import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_BOOKING_RULE = {
  advanceOpenDays: 14,
  closedDates: [],
  dailySlots: ['10:00-11:00', '11:30-12:30', '14:00-15:00']
};

function isDateText(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isSlotText(value: string) {
  return /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(value);
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => `${item}`.trim()).filter(Boolean);
    }
  } catch (_error) {
    return [];
  }

  return [];
}

function sortSlots(slots: string[]) {
  return [...slots].sort((left, right) => left.localeCompare(right));
}

function normalizeClosedDates(value: string | null | undefined) {
  return [...new Set(parseStringArray(value).filter(isDateText))].sort((left, right) => left.localeCompare(right));
}

function normalizeDailySlots(value: string | null | undefined) {
  return sortSlots([...new Set(parseStringArray(value).filter(isSlotText))]);
}

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
