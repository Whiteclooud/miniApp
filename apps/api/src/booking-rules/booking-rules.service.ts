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

function assertRulesPayload(input: unknown): asserts input is UpdateBookingRulesInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException({
      error: 'Booking rules payload must be an object',
      code: 'INVALID_BOOKING_RULE_PAYLOAD'
    });
  }
}

function resolveStringArrayField(
  input: UpdateBookingRulesInput,
  field: 'closedDates' | 'dailySlots',
  fallback: string[],
  code: string
) {
  const value = input[field];
  if (value === undefined) {
    return fallback;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new BadRequestException({
      error: `${field} must be an array of strings`,
      code
    });
  }

  return value;
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

function validateNonNegativeInteger(value: unknown, field: string, code: string, fallback: number) {
  const source = value === undefined ? fallback : value;
  if (
    typeof source === 'boolean' ||
    (typeof source !== 'number' && typeof source !== 'string') ||
    (typeof source === 'string' && !source.trim())
  ) {
    throw new BadRequestException({
      error: `${field} must be a non-negative integer`,
      code
    });
  }

  const numberValue = Number(source);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new BadRequestException({
      error: `${field} must be a non-negative integer`,
      code
    });
  }

  return numberValue;
}

function validateAdvanceOpenDays(value: unknown) {
  return validateNonNegativeInteger(
    value,
    'advanceOpenDays',
    'INVALID_ADVANCE_OPEN_DAYS',
    DEFAULT_BOOKING_RULE.advanceOpenDays
  );
}

function validateWeeklyOpenDays(value: unknown) {
  const source = value === undefined
    ? DEFAULT_BOOKING_RULE.weeklyOpenDays
    : value;

  if (!Array.isArray(source)) {
    throw new BadRequestException({
      error: 'weeklyOpenDays must be an array',
      code: 'INVALID_WEEKLY_OPEN_DAYS'
    });
  }

  const invalidDay = source.find((item) => {
    if (
      item === null ||
      (typeof item === 'string' && !item.trim()) ||
      (typeof item !== 'number' && typeof item !== 'string')
    ) {
      return true;
    }

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
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new BadRequestException({
      error: 'sameDayCutoffTime must use HH:mm format',
      code: 'INVALID_SAME_DAY_CUTOFF_TIME'
    });
  }

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
  return validateNonNegativeInteger(
    value,
    'minAdvanceHours',
    'INVALID_MIN_ADVANCE_HOURS',
    0
  );
}

function validateDateSlotOverrides(value: unknown) {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException({
      error: 'dateSlotOverrides must be an object',
      code: 'INVALID_DATE_SLOT_OVERRIDES'
    });
  }

  const source = value as Record<string, unknown>;

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

    if (rawSlots.some((slot) => typeof slot !== 'string')) {
      throw new BadRequestException({
        error: `Invalid override slots for ${dateText}`,
        code: 'INVALID_DATE_SLOT_OVERRIDES'
      });
    }

    next[dateText] = validateSlotList(rawSlots, 'INVALID_DATE_SLOT_OVERRIDES');
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
    assertRulesPayload(input);

    const advanceOpenDays = validateAdvanceOpenDays(input.advanceOpenDays);
    const closedDates = validateClosedDates(
      resolveStringArrayField(input, 'closedDates', [], 'INVALID_CLOSED_DATE')
    );
    const dailySlots = validateDailySlots(
      resolveStringArrayField(input, 'dailySlots', DEFAULT_BOOKING_RULE.dailySlots, 'INVALID_SLOT')
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

    // Upsert the singleton rule so two first-time saves cannot race on the
    // fixed default id and turn a valid request into a 500/P2002 response.
    const ruleId = latestRule?.id || DEFAULT_BOOKING_RULE_ID;
    const row = await this.prisma.bookingRule.upsert({
      where: { id: ruleId },
      update: data,
      create: {
        id: ruleId,
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
