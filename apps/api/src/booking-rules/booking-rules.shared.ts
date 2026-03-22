export interface BookingRulesSnapshot {
  advanceOpenDays: number;
  closedDates: string[];
  dailySlots: string[];
  updatedAt: string;
}

export type BookingDateReasonCode = 'AVAILABLE' | 'DATE_CLOSED' | 'DATE_OUT_OF_RANGE';

export const DEFAULT_BOOKING_RULE: Omit<BookingRulesSnapshot, 'updatedAt'> = {
  advanceOpenDays: 14,
  closedDates: [],
  dailySlots: ['10:00-11:00', '11:30-12:30', '14:00-15:00']
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

function toShanghaiDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai'
  }).format(date);
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

export function isDateWithinAdvanceWindow(dateText: string, advanceOpenDays: number) {
  const today = getTodayTextInShanghai();
  const maxDate = addDaysToDateText(today, Math.max(0, advanceOpenDays));

  return dateText >= today && dateText <= maxDate;
}

export function resolveBookingDateReasonCode(
  dateText: string,
  rules: Pick<BookingRulesSnapshot, 'advanceOpenDays' | 'closedDates'>
): BookingDateReasonCode {
  if (!isDateWithinAdvanceWindow(dateText, rules.advanceOpenDays)) {
    return 'DATE_OUT_OF_RANGE';
  }

  if (rules.closedDates.includes(dateText)) {
    return 'DATE_CLOSED';
  }

  return 'AVAILABLE';
}
