import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_BOOKING_RULE,
  BookingRulesSnapshot,
  isDateText,
  isSlotText,
  isTimeText,
  normalizeClosedDates,
  normalizeDailySlots,
  normalizeDateSlotOverrides,
  normalizeWeeklyOpenDays
} from './booking-rules.shared';

const DEFAULT_BOOKING_RULE_ID = 'booking-rule-default';

export interface UpdateBookingRulesInput {
  advanceOpenDays?: number;
  closedDates?: string[];
  dailySlots?: string[];
  weeklyOpenDays?: number[];
  sameDayCutoffTime?: string;
  minAdvanceHours?: number;
  dateSlotOverrides?: Record<string, string[]>;
}

function parseSlotBoundaryMinutes(text: string) {
  const [hourText, minuteText] = text.split(':');
  return Number(hourText) * 60 + Number(minuteText);
}

function validateSlotList(slots: string[], code = 'INVALID_SLOT') {
  const invalidSlot = slots.find((slot) => !isSlotText(slot));
  if (invalidSlot) {
    throw new BadRequestException({
      error: `Invalid slot: ${invalidSlot}`,
      code
    });
  }

  const normalized = normalizeDailySlots(JSON.stringify(slots));
  for (let index = 0; index < normalized.length; index += 1) {
    const [startText, endText] = normalized[index].split('-');
    const startMinutes = parseSlotBoundaryMinutes(startText);
    const endMinutes = parseSlotBoundaryMinutes(endText);

    if (startMinutes >= endMinutes) {
      throw new BadRequestException({
        error: `Invalid slot range: ${normalized[index]}`,
        code
      });
    }

    if (index > 0) {
      const previousEndText = normalized[index - 1].split('-')[1];
      const previousEndMinutes = parseSlotBoundaryMinutes(previousEndText);
      if (startMinutes < previousEndMinutes) {
        throw new BadRequestException({
          error: `Overlapping slots: ${normalized[index - 1]} and ${normalized[index]}`,
          code
        });
      }
    }
  }

  return normalized;
}

function validateDailySlots(dailySlots: string[]) {
  return validateSlotList(dailySlots, 'INVALID_SLOT');
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

function validateWeeklyOpenDays(value: unknown) {
  const source = Array.isArray(value) ? value : DEFAULT_BOOKING_RULE.weeklyOpenDays;
  const invalidDay = source.find((item) => {
    const numberValue = Number(item);
    return !Number.isInteger(numberValue) || numberValue < 0 || numberValue > 6;
  });

  if (invalidDay !== undefined) {
    throw new BadRequestException({
      error: `Invalid weekly open day: ${invalidDay}`,
      code: 'INVALID_WEEKLY_OPEN_DAYS'
    });
  }

  const normalized = normalizeWeeklyOpenDays(JSON.stringify(source));
  if (!normalized.length) {
    throw new BadRequestException({
      error: 'weeklyOpenDays must include at least one day',
      code: 'INVALID_WEEKLY_OPEN_DAYS'
    });
  }

  return normalized;
}

function validateSameDayCutoffTime(value: unknown) {
  const normalized = `${value || ''}`.trim();
  if (!normalized) {
    return '';
  }

  if (!isTimeText(normalized)) {
    throw new BadRequestException({
      error: 'sameDayCutoffTime must use HH:mm format',
      code: 'INVALID_SAME_DAY_CUTOFF_TIME'
    });
  }

  return normalized;
}

function validateMinAdvanceHours(value: unknown) {
  const numberValue = Number(value || 0);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new BadRequestException({
      error: 'minAdvanceHours must be a non-negative integer',
      code: 'INVALID_MIN_ADVANCE_HOURS'
    });
  }

  return numberValue;
}

function validateDateSlotOverrides(value: unknown) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  const result = Object.entries(source).reduce<Record<string, string[]>>((next, [dateText, rawSlots]) => {
    if (!isDateText(dateText)) {
      throw new BadRequestException({
        error: `Invalid override date: ${dateText}`,
        code: 'INVALID_DATE_SLOT_OVERRIDES'
      });
    }

    if (!Array.isArray(rawSlots)) {
      throw new BadRequestException({
        error: `Invalid override slots for ${dateText}`,
        code: 'INVALID_DATE_SLOT_OVERRIDES'
      });
    }

    next[dateText] = validateSlotList(rawSlots.map((slot) => `${slot}`), 'INVALID_DATE_SLOT_OVERRIDES');
    return next;
  }, {});

  return normalizeDateSlotOverrides(JSON.stringify(result));
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
      weeklyOpenDays:
        normalizeWeeklyOpenDays(row.weeklyOpenDaysJson).length
          ? normalizeWeeklyOpenDays(row.weeklyOpenDaysJson)
          : DEFAULT_BOOKING_RULE.weeklyOpenDays,
      sameDayCutoffTime: row.sameDayCutoffTime || '',
      minAdvanceHours: Math.max(0, Number(row.minAdvanceHours) || 0),
      dateSlotOverrides: normalizeDateSlotOverrides(row.dateSlotOverridesJson),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  async updateBookingRules(input: UpdateBookingRulesInput): Promise<BookingRulesSnapshot> {
    const advanceOpenDays = validateAdvanceOpenDays(
      Number(input.advanceOpenDays ?? DEFAULT_BOOKING_RULE.advanceOpenDays)
    );
    const closedDates = validateClosedDates(Array.isArray(input.closedDates) ? input.closedDates : []);
    const dailySlots = validateDailySlots(
      Array.isArray(input.dailySlots) ? input.dailySlots : DEFAULT_BOOKING_RULE.dailySlots
    );
    const weeklyOpenDays = validateWeeklyOpenDays(input.weeklyOpenDays);
    const sameDayCutoffTime = validateSameDayCutoffTime(input.sameDayCutoffTime);
    const minAdvanceHours = validateMinAdvanceHours(input.minAdvanceHours);
    const dateSlotOverrides = validateDateSlotOverrides(input.dateSlotOverrides);

    const latestRule = await this.prisma.bookingRule.findFirst({
      orderBy: {
        updatedAt: 'desc'
      },
      select: {
        id: true
      }
    });

    const data = {
      advanceOpenDays,
      closedDatesJson: JSON.stringify(closedDates),
      dailySlotsJson: JSON.stringify(dailySlots),
      weeklyOpenDaysJson: JSON.stringify(weeklyOpenDays),
      sameDayCutoffTime: sameDayCutoffTime || null,
      minAdvanceHours,
      dateSlotOverridesJson: JSON.stringify(dateSlotOverrides)
    };

    const row = latestRule
      ? await this.prisma.bookingRule.update({
          where: { id: latestRule.id },
          data
        })
      : await this.prisma.bookingRule.create({
          data: {
            id: DEFAULT_BOOKING_RULE_ID,
            ...data
          }
        });

    return {
      advanceOpenDays: row.advanceOpenDays,
      closedDates: normalizeClosedDates(row.closedDatesJson),
      dailySlots: normalizeDailySlots(row.dailySlotsJson),
      weeklyOpenDays: normalizeWeeklyOpenDays(row.weeklyOpenDaysJson),
      sameDayCutoffTime: row.sameDayCutoffTime || '',
      minAdvanceHours: Math.max(0, Number(row.minAdvanceHours) || 0),
      dateSlotOverrides: normalizeDateSlotOverrides(row.dateSlotOverridesJson),
      updatedAt: row.updatedAt.toISOString()
    };
  }
}
