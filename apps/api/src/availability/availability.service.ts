import { AppointmentStatus } from '@prisma/client';
import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingRulesService } from '../booking-rules/booking-rules.service';
import {
  BookingDateReasonCode,
  BookingRulesSnapshot,
  BookingSlotReasonCode,
  addDaysToDateText,
  getTodayTextInShanghai,
  isDateText,
  resolveBookingDateReasonCode,
  resolveBookingSlotReasonCode,
  resolveDailySlotsForDate
} from '../booking-rules/booking-rules.shared';
import { PrismaService } from '../prisma/prisma.service';

export interface AvailabilityItem {
  date: string;
  timeSlot: string;
  status: 'active' | 'disabled';
  reasonCode: BookingSlotReasonCode;
  reasonText: string;
}

export interface AvailabilityCalendarDay {
  date: string;
  status: 'active' | 'disabled';
  reasonCode: BookingSlotReasonCode;
  reasonText: string;
}

export interface AvailabilityResponse {
  dateOptions: string[];
  calendarDays: AvailabilityCalendarDay[];
  selectedDate: string;
  items: AvailabilityItem[];
}

function toSlotReasonText(reasonCode: AvailabilityItem['reasonCode']) {
  switch (reasonCode) {
    case 'DATE_CLOSED':
      return '当日关闭';
    case 'DATE_OUT_OF_RANGE':
      return '当前日期未开放预约';
    case 'WEEKDAY_CLOSED':
      return '非营业日';
    case 'BOOKING_CUTOFF_PASSED':
      return '已过当天预约截止时间';
    case 'SLOT_OCCUPIED':
      return '该时段已被预约';
    case 'MIN_ADVANCE_REQUIRED':
      return '未满足提前预约时间';
    case 'AVAILABLE':
    default:
      return '可预约';
  }
}

function toCalendarReasonText(reasonCode: AvailabilityCalendarDay['reasonCode']) {
  switch (reasonCode) {
    case 'DATE_CLOSED':
      return '门店休息';
    case 'DATE_OUT_OF_RANGE':
      return '超出开放窗口';
    case 'WEEKDAY_CLOSED':
      return '非营业日';
    case 'BOOKING_CUTOFF_PASSED':
      return '当天预约已截止';
    case 'SLOT_OCCUPIED':
      return '当日已满';
    case 'MIN_ADVANCE_REQUIRED':
      return '需更早预约';
    case 'AVAILABLE':
    default:
      return '可预约';
  }
}

function buildDateOptions(advanceOpenDays: number, today: string) {
  const safeAdvanceOpenDays = Math.max(0, Number(advanceOpenDays) || 0);
  return Array.from({ length: safeAdvanceOpenDays + 1 }, (_value, index) =>
    addDaysToDateText(today, index)
  );
}

function buildMonthDates(dateText: string) {
  const [yearText, monthText] = dateText.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const firstDate = `${yearText}-${monthText}-01`;
  const nextMonthFirst =
    month === 12 ? `${year + 1}-01-01` : `${yearText}-${`${month + 1}`.padStart(2, '0')}-01`;
  const lastDate = addDaysToDateText(nextMonthFirst, -1);
  const totalDays = Number(lastDate.slice(-2));

  return Array.from({ length: totalDays }, (_value, index) =>
    addDaysToDateText(firstDate, index)
  );
}

function pickCalendarDisabledReason(reasonCodes: BookingSlotReasonCode[]) {
  if (reasonCodes.every((code) => code === 'SLOT_OCCUPIED')) {
    return 'SLOT_OCCUPIED';
  }

  if (reasonCodes.every((code) => code === 'MIN_ADVANCE_REQUIRED')) {
    return 'MIN_ADVANCE_REQUIRED';
  }

  return reasonCodes[0] || 'DATE_CLOSED';
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingRulesService: BookingRulesService
  ) {}

  async getAvailability(date?: string): Promise<AvailabilityResponse> {
    const requestedDate = `${date || ''}`.trim();
    const today = getTodayTextInShanghai();

    if (requestedDate && !isDateText(requestedDate)) {
      throw new BadRequestException({
        error: 'Invalid date',
        code: 'INVALID_DATE'
      });
    }

    const bookingRules = await this.bookingRulesService.getBookingRules();
    const dateOptions = buildDateOptions(bookingRules.advanceOpenDays, today);
    const selectedDate = requestedDate || dateOptions[0] || today;
    const monthDates = buildMonthDates(selectedDate);

    const approvedAppointments = await this.prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.APPROVED,
        date: {
          in: monthDates
        }
      },
      select: {
        date: true,
        timeSlot: true
      }
    });

    const approvedSlotsByDate = approvedAppointments.reduce<Record<string, Set<string>>>((result, item) => {
      if (!result[item.date]) {
        result[item.date] = new Set<string>();
      }
      result[item.date].add(item.timeSlot);
      return result;
    }, {});

    const selectedDateReasonCode = resolveBookingDateReasonCode(selectedDate, bookingRules);
    const selectedDateApprovedSlots = approvedSlotsByDate[selectedDate] || new Set<string>();
    const selectedDateSlots = resolveDailySlotsForDate(bookingRules, selectedDate);
    const items = selectedDateSlots.map((timeSlot) =>
      this.toAvailabilityItem(
        selectedDate,
        timeSlot,
        selectedDateReasonCode,
        selectedDateApprovedSlots,
        bookingRules
      )
    );

    const calendarDays = monthDates.map((dateText) => {
      const dateReasonCode = resolveBookingDateReasonCode(dateText, bookingRules);
      const approvedSlots = approvedSlotsByDate[dateText] || new Set<string>();
      const slots = resolveDailySlotsForDate(bookingRules, dateText);
      return this.toCalendarDay(dateText, dateReasonCode, slots, approvedSlots, bookingRules);
    });

    return {
      dateOptions,
      calendarDays,
      selectedDate,
      items
    };
  }

  private toAvailabilityItem(
    date: string,
    timeSlot: string,
    bookingDateReasonCode: BookingDateReasonCode,
    approvedSlots: Set<string>,
    rules: Pick<BookingRulesSnapshot, 'minAdvanceHours'>
  ): AvailabilityItem {
    const reasonCode = resolveBookingSlotReasonCode(
      date,
      timeSlot,
      rules,
      bookingDateReasonCode,
      approvedSlots
    );

    return {
      date,
      timeSlot,
      status: reasonCode === 'AVAILABLE' ? 'active' : 'disabled',
      reasonCode,
      reasonText: toSlotReasonText(reasonCode)
    };
  }

  private toCalendarDay(
    date: string,
    bookingDateReasonCode: BookingDateReasonCode,
    dailySlots: string[],
    approvedSlots: Set<string>,
    rules: Pick<BookingRulesSnapshot, 'minAdvanceHours'>
  ): AvailabilityCalendarDay {
    if (bookingDateReasonCode !== 'AVAILABLE') {
      return {
        date,
        status: 'disabled',
        reasonCode: bookingDateReasonCode,
        reasonText: toCalendarReasonText(bookingDateReasonCode)
      };
    }

    if (!dailySlots.length) {
      return {
        date,
        status: 'disabled',
        reasonCode: 'DATE_CLOSED',
        reasonText: toCalendarReasonText('DATE_CLOSED')
      };
    }

    const reasonCodes = dailySlots.map((timeSlot) =>
      resolveBookingSlotReasonCode(date, timeSlot, rules, bookingDateReasonCode, approvedSlots)
    );

    if (reasonCodes.some((reasonCode) => reasonCode === 'AVAILABLE')) {
      return {
        date,
        status: 'active',
        reasonCode: 'AVAILABLE',
        reasonText: toCalendarReasonText('AVAILABLE')
      };
    }

    const reasonCode = pickCalendarDisabledReason(reasonCodes);
    return {
      date,
      status: 'disabled',
      reasonCode,
      reasonText: toCalendarReasonText(reasonCode)
    };
  }
}
