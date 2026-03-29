import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_BOOKING_RULE,
  BookingRulesSnapshot,
  isDateText,
  isSlotText,
  normalizeClosedDates,
  normalizeDailySlots
} from './booking-rules.shared';

const DEFAULT_BOOKING_RULE_ID = 'booking-rule-default';

export interface UpdateBookingRulesInput {
  advanceOpenDays?: number;
  closedDates?: string[];
  dailySlots?: string[];
}

function parseSlotBoundaryMinutes(text: string) {
  const [hourText, minuteText] = text.split(':');
  return Number(hourText) * 60 + Number(minuteText);
}

function validateDailySlots(dailySlots: string[]) {
  const invalidSlot = dailySlots.find((slot) => !isSlotText(slot));
  if (invalidSlot) {
    throw new BadRequestException({
      error: `Invalid slot: ${invalidSlot}`,
      code: 'INVALID_SLOT'
    });
  }

  const normalized = normalizeDailySlots(JSON.stringify(dailySlots));
  for (let index = 0; index < normalized.length; index += 1) {
    const [startText, endText] = normalized[index].split('-');
    const startMinutes = parseSlotBoundaryMinutes(startText);
    const endMinutes = parseSlotBoundaryMinutes(endText);

    if (startMinutes >= endMinutes) {
      throw new BadRequestException({
        error: `Invalid slot range: ${normalized[index]}`,
        code: 'INVALID_SLOT'
      });
    }

    if (index > 0) {
      const previousEndText = normalized[index - 1].split('-')[1];
      const previousEndMinutes = parseSlotBoundaryMinutes(previousEndText);
      if (startMinutes < previousEndMinutes) {
        throw new BadRequestException({
          error: `Overlapping slots: ${normalized[index - 1]} and ${normalized[index]}`,
          code: 'INVALID_SLOT'
        });
      }
    }
  }

  return normalized;
}

function validateClosedDates(closedDates: string[]) {
  const invalidDate = closedDates.find((dateText) => !isDateText(`${dateText}`));
  if (invalidDate) {
    throw new BadRequestException({
      error: `Invalid closed date: ${invalidDate}`,
      code: 'INVALID_CLOSED_DATE'
    });
  }

  return normalizeClosedDates(JSON.stringify(closedDates));
}

function validateAdvanceOpenDays(value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestException({
      error: 'advanceOpenDays must be a non-negative integer',
      code: 'INVALID_ADVANCE_OPEN_DAYS'
    });
  }

  return value;
}

@Injectable()
export class BookingRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async getBookingRules(): Promise<BookingRulesSnapshot> {
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

  async updateBookingRules(input: UpdateBookingRulesInput): Promise<BookingRulesSnapshot> {
    const advanceOpenDays = validateAdvanceOpenDays(Number(input.advanceOpenDays));
    const closedDates = validateClosedDates(Array.isArray(input.closedDates) ? input.closedDates : []);
    const dailySlots = validateDailySlots(Array.isArray(input.dailySlots) ? input.dailySlots : []);

    const latestRule = await this.prisma.bookingRule.findFirst({
      orderBy: {
        updatedAt: 'desc'
      },
      select: {
        id: true
      }
    });

    const row = latestRule
      ? await this.prisma.bookingRule.update({
          where: { id: latestRule.id },
          data: {
            advanceOpenDays,
            closedDatesJson: JSON.stringify(closedDates),
            dailySlotsJson: JSON.stringify(dailySlots)
          }
        })
      : await this.prisma.bookingRule.create({
          data: {
            id: DEFAULT_BOOKING_RULE_ID,
            advanceOpenDays,
            closedDatesJson: JSON.stringify(closedDates),
            dailySlotsJson: JSON.stringify(dailySlots)
          }
        });

    return {
      advanceOpenDays: row.advanceOpenDays,
      closedDates: normalizeClosedDates(row.closedDatesJson),
      dailySlots: normalizeDailySlots(row.dailySlotsJson),
      updatedAt: row.updatedAt.toISOString()
    };
  }
}
