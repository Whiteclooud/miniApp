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
  resolveBookingDateReasonCode,
  resolveBookingSlotReasonCode,
  resolveDailySlotsForDate
} from '../booking-rules/booking-rules.shared';
import { PrismaService } from '../prisma/prisma.service';
import { ApiAppointmentItem, toApiAppointmentItem } from './appointment-response';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

const MAX_REFERENCE_IMAGE_COUNT = 6;

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
    const referenceImageUrls = this.normalizeReferenceImageUrls(payload.referenceImageUrls);

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

    const availableSlots = resolveDailySlotsForDate(bookingRules, appointmentDate);

    if (!availableSlots.includes(timeSlot)) {
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

    const slotReasonCode = resolveBookingSlotReasonCode(
      appointmentDate,
      timeSlot,
      bookingRules,
      bookingDateReasonCode,
      new Set<string>()
    );

    if (slotReasonCode !== 'AVAILABLE') {
      throw new BadRequestException({
        error: 'Slot unavailable',
        code: slotReasonCode
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.create({
        data: {
          customerOpenId,
          customerName: `${payload.customerName || ''}`.trim() || null,
          phone: `${payload.phone || ''}`.trim() || null,
          date: appointmentDate,
          timeSlot,
          approvedSlotKey: null,
          note: `${payload.note || ''}`.trim() || null,
          referenceImageUrlsJson: JSON.stringify(referenceImageUrls),
          status: AppointmentStatus.PENDING,
          reviewedAt: null,
          reviewedByOpenId: null,
          reviewNote: null,
          cancelledAt: null,
          cancelledByOpenId: null,
          cancelReason: null
        }
      });

      await tx.appointmentAuditLog.create({
        data: {
          appointmentId: appointment.id,
          actorOpenId: customerOpenId,
          actorRole: 'customer',
          action: 'CREATE',
          fromStatus: null,
          toStatus: appointment.status,
          fromDate: null,
          toDate: appointment.date,
          fromTimeSlot: null,
          toTimeSlot: appointment.timeSlot,
          note: appointment.note
        }
      });

      return appointment;
    });

    return toApiAppointmentItem(created);
  }

  private resolveAppointmentDate(payload: CreateAppointmentDto) {
    return `${payload.appointmentDate || payload.date || ''}`.trim();
  }

  private normalizeReferenceImageUrls(value: unknown): string[] {
    if (value === undefined) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException({
        error: 'Invalid reference image URLs',
        code: 'INVALID_REFERENCE_IMAGE_URLS'
      });
    }

    if (value.length > MAX_REFERENCE_IMAGE_COUNT) {
      throw new BadRequestException({
        error: 'Too many reference images',
        code: 'REFERENCE_IMAGE_COUNT_EXCEEDED'
      });
    }

    return value.map((item) => {
      if (typeof item !== 'string' || !item.trim()) {
        throw new BadRequestException({
          error: 'Invalid reference image URLs',
          code: 'INVALID_REFERENCE_IMAGE_URLS'
        });
      }

      const normalizedUrl = item.trim();

      try {
        const parsedUrl = new URL(normalizedUrl);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          throw new Error('Unsupported URL protocol');
        }
      } catch (_error) {
        throw new BadRequestException({
          error: 'Invalid reference image URLs',
          code: 'INVALID_REFERENCE_IMAGE_URLS'
        });
      }

      return normalizedUrl;
    });
  }
}
