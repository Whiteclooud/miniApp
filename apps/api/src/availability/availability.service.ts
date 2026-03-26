import { AppointmentStatus } from '@prisma/client';
import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingRulesService } from '../booking-rules/booking-rules.service';
import {
  BookingDateReasonCode,
  addDaysToDateText,
  getTodayTextInShanghai,
  isDateText,
  resolveBookingDateReasonCode
} from '../booking-rules/booking-rules.shared';
import { PrismaService } from '../prisma/prisma.service';

export interface AvailabilityItem {
  date: string;
  timeSlot: string;
  status: 'active' | 'disabled';
  reasonCode: 'AVAILABLE' | 'DATE_CLOSED' | 'DATE_OUT_OF_RANGE' | 'SLOT_OCCUPIED';
  reasonText: string;
}

export interface AvailabilityResponse {
  dateOptions: string[];
  selectedDate: string;
  items: AvailabilityItem[];
}

function toReasonText(reasonCode: AvailabilityItem['reasonCode']) {
  switch (reasonCode) {
    case 'DATE_CLOSED':
      return '当日关闭';
    case 'DATE_OUT_OF_RANGE':
      return '当前日期未开放预约';
    case 'SLOT_OCCUPIED':
      return '该时间段已被预约';
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
    const bookingDateReasonCode = resolveBookingDateReasonCode(selectedDate, bookingRules);

    const approvedAppointments = await this.prisma.appointment.findMany({
      where: {
        date: selectedDate,
        status: AppointmentStatus.APPROVED
      },
      select: {
        timeSlot: true
      }
    });

    const approvedSlots = new Set(approvedAppointments.map((item) => item.timeSlot));
    const items = bookingRules.dailySlots.map((timeSlot) =>
      this.toAvailabilityItem(selectedDate, timeSlot, bookingDateReasonCode, approvedSlots)
    );

    return {
      dateOptions,
      selectedDate,
      items
    };
  }

  private toAvailabilityItem(
    date: string,
    timeSlot: string,
    bookingDateReasonCode: BookingDateReasonCode,
    approvedSlots: Set<string>
  ): AvailabilityItem {
    if (bookingDateReasonCode !== 'AVAILABLE') {
      return {
        date,
        timeSlot,
        status: 'disabled',
        reasonCode: bookingDateReasonCode,
        reasonText: toReasonText(bookingDateReasonCode)
      };
    }

    if (approvedSlots.has(timeSlot)) {
      return {
        date,
        timeSlot,
        status: 'disabled',
        reasonCode: 'SLOT_OCCUPIED',
        reasonText: toReasonText('SLOT_OCCUPIED')
      };
    }

    return {
      date,
      timeSlot,
      status: 'active',
      reasonCode: 'AVAILABLE',
      reasonText: toReasonText('AVAILABLE')
    };
  }
}
