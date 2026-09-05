import { AppointmentStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
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
const MAX_REFERENCE_IMAGE_URL_LENGTH = 2048;
const MAX_CUSTOMER_NAME_LENGTH = 30;
const MAX_PHONE_LENGTH = 32;
const MAX_NOTE_LENGTH = 200;
const CUSTOMER_UPLOAD_PATH_PREFIX = '/api/v1/uploads/images/';
const CUSTOMER_UPLOAD_FILENAME_PATTERN =
  /^customer-([a-f0-9]{64})-(\d{10,16})-([a-f0-9]{24})\.(?:jpg|png|webp)$/;

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
    const referenceImageUrls = this.normalizeReferenceImageUrls(
      payload.referenceImageUrls,
      customerOpenId
    );
    const customerName = this.normalizeText(payload.customerName, MAX_CUSTOMER_NAME_LENGTH, 'INVALID_CUSTOMER_NAME');
    const phone = this.normalizeText(payload.phone, MAX_PHONE_LENGTH, 'INVALID_PHONE');
    const note = this.normalizeText(payload.note, MAX_NOTE_LENGTH, 'INVALID_NOTE');

    if (phone && !/^1\d{10}$/.test(phone)) {
      throw new BadRequestException({ error: 'Invalid phone', code: 'INVALID_PHONE' });
    }

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
          customerName: customerName || null,
          phone: phone || null,
          date: appointmentDate,
          timeSlot,
          approvedSlotKey: null,
          note: note || null,
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

  private normalizeText(value: unknown, maxLength: number, code: string) {
    if (value === undefined || value === null) {
      return '';
    }
    if (typeof value !== 'string') {
      throw new BadRequestException({ error: 'Invalid appointment payload', code });
    }
    const normalized = value.trim();
    if (normalized.length > maxLength) {
      throw new BadRequestException({ error: 'Invalid appointment payload', code });
    }
    return normalized;
  }

  private normalizeReferenceImageUrls(value: unknown, customerOpenId: string): string[] {
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

    const urls = value.map((item) => {
      if (typeof item !== 'string' || !item.trim()) {
        throw new BadRequestException({
          error: 'Invalid reference image URLs',
          code: 'INVALID_REFERENCE_IMAGE_URLS'
        });
      }

      const normalizedUrl = item.trim();
      if (normalizedUrl.length > MAX_REFERENCE_IMAGE_URL_LENGTH) {
        throw new BadRequestException({
          error: 'Invalid reference image URLs',
          code: 'INVALID_REFERENCE_IMAGE_URLS'
        });
      }

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

      this.assertCustomerOwnedUpload(normalizedUrl, customerOpenId);

      return normalizedUrl;
    });

    return [...new Set(urls)];
  }

  private assertCustomerOwnedUpload(imageUrl: string, customerOpenId: string) {
    let pathname = '';
    try {
      pathname = new URL(imageUrl).pathname;
    } catch (_error) {
      return;
    }

    if (!pathname.startsWith(CUSTOMER_UPLOAD_PATH_PREFIX)) {
      return;
    }

    const encodedFilename = pathname.slice(CUSTOMER_UPLOAD_PATH_PREFIX.length);
    let filename = '';
    try {
      filename = decodeURIComponent(encodedFilename);
    } catch (_error) {
      filename = '';
    }
    const match = filename.match(CUSTOMER_UPLOAD_FILENAME_PATTERN);
    const ownerHash = createHash('sha256').update(customerOpenId).digest('hex');
    if (!match || match[1] !== ownerHash) {
      throw new BadRequestException({
        error: 'Reference image is not owned by current customer',
        code: 'REFERENCE_IMAGE_FORBIDDEN'
      });
    }
  }
}
