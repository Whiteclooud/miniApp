import {
  AppointmentStatus,
  Prisma,
  type Appointment
} from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { BookingRulesService } from '../booking-rules/booking-rules.service';
import {
  isDateText,
  isSlotText,
  resolveBookingDateReasonCode,
  resolveBookingSlotReasonCode,
  resolveDailySlotsForDate
} from '../booking-rules/booking-rules.shared';
import { ApiAppointmentItem, mapAppointmentStatus, toApiAppointmentItem } from '../appointments/appointment-response';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAppointmentsService } from '../staff-appointments/staff-appointments.service';
import {
  RescheduleStaffAppointmentDto,
  ReviewStaffAppointmentDto
} from './dto/review-staff-appointment.dto';

export interface ReviewStaffAppointmentResultItem {
  id: string;
  status: ReturnType<typeof mapAppointmentStatus>;
  reviewedAt: string;
  reviewedBy: string;
  reviewNote: string;
}

function toApprovedSlotKey(date: string, timeSlot: string) {
  return `${date}#${timeSlot}`;
}

function resolveAppointmentDate(payload: RescheduleStaffAppointmentDto) {
  const value = payload.appointmentDate !== undefined ? payload.appointmentDate : payload.date;
  if (value !== undefined && typeof value !== 'string') {
    throw new BadRequestException({
      error: 'appointmentDate must be a string',
      code: 'INVALID_APPOINTMENT_DATE'
    });
  }

  return `${value || ''}`.trim();
}

function assertObjectPayload(value: unknown, code: string, label: string): asserts value is object {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException({
      error: `${label} payload must be an object`,
      code
    });
  }
}

function normalizeReviewNote(value: unknown) {
  if (value === undefined) {
    return '';
  }

  if (typeof value !== 'string' || value.trim().length > 2000) {
    throw new BadRequestException({
      error: 'reviewNote must be a string with at most 2000 characters',
      code: 'INVALID_REVIEW_NOTE'
    });
  }

  return value.trim();
}

@Injectable()
export class StaffAppointmentReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffAppointmentsService: StaffAppointmentsService,
    private readonly bookingRulesService: BookingRulesService
  ) {}

  async reviewStaffAppointment(
    staffOpenId?: string,
    appointmentId?: string,
    payload: ReviewStaffAppointmentDto = {}
  ): Promise<ReviewStaffAppointmentResultItem> {
    const normalizedStaffOpenId = this.staffAppointmentsService.assertStaffAuthorized(staffOpenId);
    const normalizedAppointmentId = this.normalizeAppointmentId(appointmentId);
    assertObjectPayload(payload, 'INVALID_REVIEW_PAYLOAD', 'Review');
    const targetStatus = this.resolveTargetStatus(payload);
    const normalizedReviewNote = normalizeReviewNote(payload.reviewNote);

    try {
      const updatedAppointment = await this.prisma.$transaction(async (tx) => {
        // Serialize all status/slot transitions for this appointment. Without a
        // current-row lock, a concurrent review and reschedule can each read
        // APPROVED and leave a rejected row carrying an approved slot key.
        const appointment = await this.findAppointmentForUpdate(tx, normalizedAppointmentId);

        if (targetStatus === AppointmentStatus.APPROVED) {
          await this.assertSlotNotOccupied(tx, appointment.id, appointment.date, appointment.timeSlot);
        }

        const now = new Date();
        const updated = await tx.appointment.update({
          where: {
            id: appointment.id
          },
          data: {
            status: targetStatus,
            approvedSlotKey:
              targetStatus === AppointmentStatus.APPROVED
                ? toApprovedSlotKey(appointment.date, appointment.timeSlot)
                : null,
            reviewedAt: now,
            reviewedByOpenId: normalizedStaffOpenId,
            reviewNote: normalizedReviewNote,
            cancelledAt: targetStatus === AppointmentStatus.CANCELLED ? now : null,
            cancelledByOpenId:
              targetStatus === AppointmentStatus.CANCELLED
                ? normalizedStaffOpenId
                : null,
            cancelReason:
              targetStatus === AppointmentStatus.CANCELLED
                ? normalizedReviewNote || (appointment.status === AppointmentStatus.CANCELLED
                    ? appointment.cancelReason
                    : null)
                : null
          }
        });

        await tx.appointmentAuditLog.create({
          data: {
            appointmentId: appointment.id,
            actorOpenId: normalizedStaffOpenId,
            actorRole: 'staff',
            action: 'STAFF_STATUS_UPDATE',
            fromStatus: appointment.status,
            toStatus: targetStatus,
            fromDate: appointment.date,
            toDate: appointment.date,
            fromTimeSlot: appointment.timeSlot,
            toTimeSlot: appointment.timeSlot,
            note: normalizedReviewNote || null
          }
        });

        return updated;
      });

      return this.toReviewResultItem(updatedAppointment);
    } catch (error) {
      if (this.isUniqueSlotConflict(error)) {
        throw new ConflictException({
          error: 'Slot occupied',
          code: 'SLOT_OCCUPIED'
        });
      }

      if (this.isRecordNotFound(error)) {
        this.throwAppointmentNotFound();
      }

      throw error;
    }
  }

  async rescheduleStaffAppointment(
    staffOpenId?: string,
    appointmentId?: string,
    payload: RescheduleStaffAppointmentDto = {}
  ): Promise<ApiAppointmentItem> {
    const normalizedStaffOpenId = this.staffAppointmentsService.assertStaffAuthorized(staffOpenId);
    const normalizedAppointmentId = this.normalizeAppointmentId(appointmentId);
    assertObjectPayload(payload, 'INVALID_RESCHEDULE_PAYLOAD', 'Reschedule');
    const appointmentDate = resolveAppointmentDate(payload);
    if (payload.timeSlot !== undefined && typeof payload.timeSlot !== 'string') {
      throw new BadRequestException({
        error: 'timeSlot must be a string',
        code: 'INVALID_SLOT'
      });
    }
    const timeSlot = `${payload.timeSlot || ''}`.trim();
    const reviewNote = normalizeReviewNote(payload.reviewNote);

    try {
      const updatedAppointment = await this.prisma.$transaction(async (tx) => {
        const appointment = await this.findAppointmentForUpdate(tx, normalizedAppointmentId);

        if (
          appointment.status !== AppointmentStatus.PENDING &&
          appointment.status !== AppointmentStatus.APPROVED
        ) {
          throw new BadRequestException({
            error: 'Appointment cannot be rescheduled',
            code: 'APPOINTMENT_NOT_RESCHEDULABLE'
          });
        }

        // Validate against the current rules after locking the appointment row,
        // so a concurrent status change cannot use stale appointment data.
        await this.assertSlotAllowedByRules(appointmentDate, timeSlot);
        await this.assertSlotNotOccupied(tx, appointment.id, appointmentDate, timeSlot);

        const updated = await tx.appointment.update({
          where: {
            id: appointment.id
          },
          data: {
            date: appointmentDate,
            timeSlot,
            approvedSlotKey:
              appointment.status === AppointmentStatus.APPROVED
                ? toApprovedSlotKey(appointmentDate, timeSlot)
                : null,
            reviewedAt: new Date(),
            reviewedByOpenId: normalizedStaffOpenId,
            reviewNote: reviewNote || appointment.reviewNote
          }
        });

        await tx.appointmentAuditLog.create({
          data: {
            appointmentId: appointment.id,
            actorOpenId: normalizedStaffOpenId,
            actorRole: 'staff',
            action: 'STAFF_RESCHEDULE',
            fromStatus: appointment.status,
            toStatus: appointment.status,
            fromDate: appointment.date,
            toDate: appointmentDate,
            fromTimeSlot: appointment.timeSlot,
            toTimeSlot: timeSlot,
            note: reviewNote || null
          }
        });

        return updated;
      });

      return toApiAppointmentItem(updatedAppointment);
    } catch (error) {
      if (this.isUniqueSlotConflict(error)) {
        throw new ConflictException({
          error: 'Slot occupied',
          code: 'SLOT_OCCUPIED'
        });
      }

      if (this.isRecordNotFound(error)) {
        this.throwAppointmentNotFound();
      }

      throw error;
    }
  }

  private normalizeAppointmentId(appointmentId?: string) {
    const normalizedAppointmentId = `${appointmentId || ''}`.trim();

    if (!normalizedAppointmentId) {
      throw new NotFoundException({
        error: 'Appointment not found',
        code: 'APPOINTMENT_NOT_FOUND'
      });
    }

    return normalizedAppointmentId;
  }

  private async findAppointmentForUpdate(tx: Prisma.TransactionClient, appointmentId: string) {
    // Prisma's regular findUnique does not expose SELECT ... FOR UPDATE. Lock
    // the row first, then read it through Prisma for the mapped model.
    const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM appointments
      WHERE id = ${appointmentId}
      FOR UPDATE
    `;

    const appointment = lockedRows.length
      ? await tx.appointment.findUnique({
          where: {
            id: lockedRows[0].id
          }
        })
      : null;

    if (!appointment) {
      throw new NotFoundException({
        error: 'Appointment not found',
        code: 'APPOINTMENT_NOT_FOUND'
      });
    }

    return appointment;
  }

  private resolveTargetStatus(payload: ReviewStaffAppointmentDto): AppointmentStatus {
    if (payload.status !== undefined && typeof payload.status !== 'string') {
      throw new BadRequestException({
        error: 'status must be a string',
        code: 'INVALID_REVIEW_STATUS'
      });
    }
    if (payload.action !== undefined && typeof payload.action !== 'string') {
      throw new BadRequestException({
        error: 'action must be a string',
        code: 'INVALID_REVIEW_STATUS'
      });
    }

    const normalizedStatus = `${payload.status || ''}`.trim().toLowerCase();
    const normalizedAction = `${payload.action || ''}`.trim().toLowerCase();
    const statusMap: Record<string, AppointmentStatus> = {
      approved: AppointmentStatus.APPROVED,
      rejected: AppointmentStatus.REJECTED,
      cancelled: AppointmentStatus.CANCELLED,
      canceled: AppointmentStatus.CANCELLED,
      completed: AppointmentStatus.COMPLETED,
      no_show: AppointmentStatus.NO_SHOW,
      'no-show': AppointmentStatus.NO_SHOW,
      noshow: AppointmentStatus.NO_SHOW
    };
    const actionMap: Record<string, AppointmentStatus> = {
      approve: AppointmentStatus.APPROVED,
      reject: AppointmentStatus.REJECTED,
      cancel: AppointmentStatus.CANCELLED,
      complete: AppointmentStatus.COMPLETED,
      no_show: AppointmentStatus.NO_SHOW,
      mark_no_show: AppointmentStatus.NO_SHOW
    };

    if (normalizedStatus) {
      if (statusMap[normalizedStatus]) {
        return statusMap[normalizedStatus];
      }
    } else if (normalizedAction && actionMap[normalizedAction]) {
      return actionMap[normalizedAction];
    }

    throw new BadRequestException({
      error: 'Invalid review status',
      code: 'INVALID_REVIEW_STATUS'
    });
  }

  private async assertSlotAllowedByRules(appointmentDate: string, timeSlot: string) {
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
    const dailySlots = resolveDailySlotsForDate(bookingRules, appointmentDate);

    if (!dailySlots.includes(timeSlot)) {
      throw new BadRequestException({
        error: 'Invalid slot',
        code: 'INVALID_SLOT'
      });
    }

    const reasonCode = resolveBookingSlotReasonCode(
      appointmentDate,
      timeSlot,
      bookingRules,
      bookingDateReasonCode,
      new Set<string>()
    );

    if (reasonCode !== 'AVAILABLE') {
      throw new BadRequestException({
        error: 'Slot unavailable',
        code: reasonCode
      });
    }
  }

  private async assertSlotNotOccupied(
    tx: Prisma.TransactionClient,
    appointmentId: string,
    date: string,
    timeSlot: string
  ) {
    const conflict = await tx.appointment.findFirst({
      where: {
        id: {
          not: appointmentId
        },
        date,
        timeSlot,
        status: AppointmentStatus.APPROVED
      },
      select: {
        id: true
      }
    });

    if (conflict) {
      throw new ConflictException({
        error: 'Slot occupied',
        code: 'SLOT_OCCUPIED'
      });
    }
  }

  private isUniqueSlotConflict(error: unknown) {
    return !!(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }

  private isRecordNotFound(error: unknown) {
    return !!(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2025'
    );
  }

  private throwAppointmentNotFound(): never {
    throw new NotFoundException({
      error: 'Appointment not found',
      code: 'APPOINTMENT_NOT_FOUND'
    });
  }

  private toReviewResultItem(item: Appointment): ReviewStaffAppointmentResultItem {
    return {
      id: item.id,
      status: mapAppointmentStatus(item.status),
      reviewedAt: item.reviewedAt ? item.reviewedAt.toISOString() : new Date().toISOString(),
      reviewedBy: item.reviewedByOpenId ?? '',
      reviewNote: item.reviewNote ?? ''
    };
  }
}
