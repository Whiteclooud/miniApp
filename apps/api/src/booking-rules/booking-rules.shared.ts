export interface BookingRulesSnapshot {
  advanceOpenDays: number;
  closedDates: string[];
  dailySlots: string[];
  weeklyOpenDays: number[];
  sameDayCutoffTime: string;
  minAdvanceHours: number;
  dateSlotOverrides: Record<string, string[]>;
  updatedAt: string;
}

export type BookingDateReasonCode =
  | 'AVAILABLE'
  | 'DATE_CLOSED'
  | 'DATE_OUT_OF_RANGE'
  | 'WEEKDAY_CLOSED'
  | 'BOOKING_CUTOFF_PASSED';

export type BookingSlotReasonCode = BookingDateReasonCode | 'SLOT_OCCUPIED' | 'MIN_ADVANCE_REQUIRED';

export const DEFAULT_BOOKING_RULE: Omit<BookingRulesSnapshot, 'updatedAt'> = {
  advanceOpenDays: 14,
  closedDates: [],
  dailySlots: ['10:00-11:00', '11:30-12:30', '14:00-15:00'],
  weeklyOpenDays: [0, 1, 2, 3, 4, 5, 6],
  sameDayCutoffTime: '',
  minAdvanceHours: 0,
  dateSlotOverrides: {}
};

export function isDateText(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = parseDateTextToUtc(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isSlotText(value: string) {
  return /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(value);
}

export function isTimeText(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function parseStringArray(value: string | null | undefined): string[] {
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

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (_error) {
    return {};
  }

  return {};
}

export function sortSlots(slots: string[]) {
  return [...slots].sort((left, right) => left.localeCompare(right));
}

export function normalizeClosedDates(value: string | null | undefined) {
  return [...new Set(parseStringArray(value).filter(isDateText))].sort((left, right) =>
    left.localeCompare(right)
  );
}

export function normalizeDailySlots(value: string | null | undefined) {
  return sortSlots([...new Set(parseStringArray(value).filter(isSlotText))]);
}

export function normalizeWeeklyOpenDays(value: string | null | undefined) {
  const parsed = parseStringArray(value)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);

  return [...new Set(parsed)].sort((left, right) => left - right);
}

export function normalizeDateSlotOverrides(value: string | null | undefined) {
  const parsed = parseJsonObject(value);
  return Object.entries(parsed).reduce<Record<string, string[]>>((result, [dateText, rawSlots]) => {
    if (!isDateText(dateText) || !Array.isArray(rawSlots)) {
      return result;
    }

    result[dateText] = sortSlots(
      [...new Set(rawSlots.map((item) => `${item}`.trim()).filter(isSlotText))]
    );
    return result;
  }, {});
}

function toShanghaiDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai'
  }).format(date);
}

function getShanghaiTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return { hour, minute };
}

function parseDateTextToUtc(dateText: string) {
  return new Date(`${dateText}T00:00:00.000Z`);
}

export function getTodayTextInShanghai() {
  return toShanghaiDateString(new Date());
}

export function addDaysToDateText(dateText: string, days: number) {
  const baseDate = parseDateTextToUtc(dateText);
  baseDate.setUTCDate(baseDate.getUTCDate() + days);
  return baseDate.toISOString().slice(0, 10);
}

export function parseTimeTextToMinutes(value: string) {
  if (!isTimeText(value)) {
    return null;
  }

  const [hourText, minuteText] = value.split(':');
  return Number(hourText) * 60 + Number(minuteText);
}

export function parseSlotStartMinutes(slot: string) {
  return parseTimeTextToMinutes(`${slot || ''}`.split('-')[0] || '');
}

function getWeekdayForDateText(dateText: string) {
  return parseDateTextToUtc(dateText).getUTCDay();
}

function getCurrentShanghaiMinutes() {
  const { hour, minute } = getShanghaiTimeParts();
  return hour * 60 + minute;
}

function getSlotStartDate(dateText: string, slot: string) {
  const startText = `${slot || ''}`.split('-')[0] || '';
  if (!isTimeText(startText)) {
    return null;
  }

  return new Date(`${dateText}T${startText}:00+08:00`);
}

export function isDateWithinAdvanceWindow(dateText: string, advanceOpenDays: number) {
  const today = getTodayTextInShanghai();
  const maxDate = addDaysToDateText(today, Math.max(0, advanceOpenDays));

  return dateText >= today && dateText <= maxDate;
}

export function resolveDailySlotsForDate(
  rules: Pick<BookingRulesSnapshot, 'dailySlots' | 'dateSlotOverrides'>,
  dateText: string
) {
  if (Object.prototype.hasOwnProperty.call(rules.dateSlotOverrides || {}, dateText)) {
    return rules.dateSlotOverrides[dateText] || [];
  }

  return rules.dailySlots;
}

export function resolveBookingDateReasonCode(
  dateText: string,
  rules: Pick<
    BookingRulesSnapshot,
    'advanceOpenDays' | 'closedDates' | 'weeklyOpenDays' | 'sameDayCutoffTime'
  >
): BookingDateReasonCode {
  if (!isDateWithinAdvanceWindow(dateText, rules.advanceOpenDays)) {
    return 'DATE_OUT_OF_RANGE';
  }

  if (rules.closedDates.includes(dateText)) {
    return 'DATE_CLOSED';
  }

  const weeklyOpenDays = rules.weeklyOpenDays.length
    ? rules.weeklyOpenDays
    : DEFAULT_BOOKING_RULE.weeklyOpenDays;
  if (!weeklyOpenDays.includes(getWeekdayForDateText(dateText))) {
    return 'WEEKDAY_CLOSED';
  }

  const cutoffMinutes = parseTimeTextToMinutes(rules.sameDayCutoffTime || '');
  if (cutoffMinutes !== null && dateText === getTodayTextInShanghai() && getCurrentShanghaiMinutes() >= cutoffMinutes) {
    return 'BOOKING_CUTOFF_PASSED';
  }

  return 'AVAILABLE';
}

export function resolveBookingSlotReasonCode(
  dateText: string,
  slot: string,
  rules: Pick<BookingRulesSnapshot, 'minAdvanceHours'>,
  dateReasonCode: BookingDateReasonCode,
  approvedSlots: Set<string>
): BookingSlotReasonCode {
  if (dateReasonCode !== 'AVAILABLE') {
    return dateReasonCode;
  }

  if (approvedSlots.has(slot)) {
    return 'SLOT_OCCUPIED';
  }

  const minAdvanceHours = Math.max(0, Number(rules.minAdvanceHours) || 0);
  if (minAdvanceHours > 0) {
    const slotStart = getSlotStartDate(dateText, slot);
    if (slotStart) {
      const diffMs = slotStart.getTime() - Date.now();
      if (diffMs < minAdvanceHours * 60 * 60 * 1000) {
        return 'MIN_ADVANCE_REQUIRED';
      }
    }
  }

  return 'AVAILABLE';
}
