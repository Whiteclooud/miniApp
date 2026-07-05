import { AppointmentStatus } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { BookingRulesService } from '../booking-rules/booking-rules.service';
import {
  isDateText,
  isSlotText,
  resolveBookingDateReasonCode
} from '../booking-rules/booking-rules.shared';
import { PrismaService } from '../prisma/prisma.service';
import { ApiAppointmentItem, toApiAppointmentItem } from './appointment-response';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingRulesService: BookingRulesService
  ) {}

  assertCustomerAuthorized(customerOpenId?: string) {
    const normalizedCustomerOpenId = `${customerOpenId || ''}`.trim();

    if (!normalizedCustomerOpenId) {
      throw new UnauthorizedException({
        error: 'Customer unauthorized',
        code: 'CUSTOMER_UNAUTHORIZED'
      });
    }

    return normalizedCustomerOpenId;
  }

  async createAppointment(
    customerOpenIdHeader?: string,
    payload: CreateAppointmentDto = {}
  ): Promise<ApiAppointmentItem> {
    const customerOpenId = this.assertCustomerAuthorized(customerOpenIdHeader);
    const appointmentDate = this.resolveAppointmentDate(payload);
    const timeSlot = `${payload.timeSlot || ''}`.trim();

    if (!isDateText(appointmentDate)) {
      throw new BadRequestException({
        error: 'Invalid appointment date',
        code: 'INVALID_APPOINTMENT_DATE'
      });
    }

    if (!isSlotText(timeSlot)) {
      throw new BadRequestException({
        error: 'Invalid slot',
        code: 'INVALID_SLOT'
      });
    }

    const bookingRules = await this.bookingRulesService.getBookingRules();

    const bookingDateReasonCode = resolveBookingDateReasonCode(appointmentDate, bookingRules);

    if (bookingDateReasonCode === 'DATE_OUT_OF_RANGE') {
      throw new BadRequestException({
        error: 'Date out of range',
        code: 'DATE_OUT_OF_RANGE'
      });
    }

    if (bookingDateReasonCode === 'DATE_CLOSED') {
      throw new BadRequestException({
        error: 'Date closed',
        code: 'DATE_CLOSED'
      });
    }

    if (!bookingRules.dailySlots.includes(timeSlot)) {
      throw new BadRequestException({
        error: 'Invalid slot',
        code: 'INVALID_SLOT'
      });
    }

    const approvedConflict = await this.prisma.appointment.findFirst({
      where: {
        date: appointmentDate,
        timeSlot,
        status: AppointmentStatus.APPROVED
      },
      select: {
        id: true
      }
    });

    if (approvedConflict) {
      throw new ConflictException({
        error: 'Slot occupied',
        code: 'SLOT_OCCUPIED'
      });
    }

    const created = await this.prisma.appointment.create({
      data: {
        customerOpenId,
        customerName: `${payload.customerName || ''}`.trim() || null,
        phone: `${payload.phone || ''}`.trim() || null,
        date: appointmentDate,
        timeSlot,
        approvedSlotKey: null,
        note: `${payload.note || ''}`.trim() || null,
        status: AppointmentStatus.PENDING,
        reviewedAt: null,
        reviewedByOpenId: null,
        reviewNote: null
      }
    });

    return toApiAppointmentItem(created);
  }

  private resolveAppointmentDate(payload: CreateAppointmentDto) {
    return `${payload.appointmentDate || payload.date || ''}`.trim();
  }
}
