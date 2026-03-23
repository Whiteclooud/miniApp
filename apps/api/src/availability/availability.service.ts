import { AppointmentStatus } from '@prisma/client';
import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingRulesService } from '../booking-rules/booking-rules.service';
import {
  BookingDateReasonCode,
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

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingRulesService: BookingRulesService
  ) {}

  async getAvailability(date?: string) {
    const normalizedDate = `${date || ''}`.trim() || getTodayTextInShanghai();

    if (!isDateText(normalizedDate)) {
      throw new BadRequestException({
        error: 'Invalid date',
        code: 'INVALID_DATE'
      });
    }

    const bookingRules = await this.bookingRulesService.getBookingRules();
    const bookingDateReasonCode = resolveBookingDateReasonCode(normalizedDate, bookingRules);

    const approvedAppointments = await this.prisma.appointment.findMany({
      where: {
        date: normalizedDate,
        status: AppointmentStatus.APPROVED
      },
      select: {
        timeSlot: true
      }
    });

    const approvedSlots = new Set(approvedAppointments.map((item) => item.timeSlot));

    return bookingRules.dailySlots.map((timeSlot) =>
      this.toAvailabilityItem(normalizedDate, timeSlot, bookingDateReasonCode, approvedSlots)
    );
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
