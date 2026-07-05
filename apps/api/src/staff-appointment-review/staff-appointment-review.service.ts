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
  return `${payload.appointmentDate || payload.date || ''}`.trim();
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
    const targetStatus = this.resolveTargetStatus(payload);
    const normalizedReviewNote = `${payload.reviewNote || ''}`.trim();

    try {
      const updatedAppointment = await this.prisma.$transaction(async (tx) => {
        const appointment = await this.findAppointmentOrThrow(tx, normalizedAppointmentId);

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
            cancelledAt: targetStatus === AppointmentStatus.CANCELLED ? now : appointment.cancelledAt,
            cancelledByOpenId:
              targetStatus === AppointmentStatus.CANCELLED
                ? normalizedStaffOpenId
                : appointment.cancelledByOpenId,
            cancelReason:
              targetStatus === AppointmentStatus.CANCELLED
                ? normalizedReviewNote || appointment.cancelReason
                : appointment.cancelReason
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
    const appointmentDate = resolveAppointmentDate(payload);
    const timeSlot = `${payload.timeSlot || ''}`.trim();
    const reviewNote = `${payload.reviewNote || ''}`.trim();

    await this.assertSlotAllowedByRules(appointmentDate, timeSlot);

    try {
      const updatedAppointment = await this.prisma.$transaction(async (tx) => {
        const appointment = await this.findAppointmentOrThrow(tx, normalizedAppointmentId);

        if (
          appointment.status !== AppointmentStatus.PENDING &&
          appointment.status !== AppointmentStatus.APPROVED
        ) {
          throw new BadRequestException({
            error: 'Appointment cannot be rescheduled',
            code: 'APPOINTMENT_NOT_RESCHEDULABLE'
          });
        }

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

  private async findAppointmentOrThrow(tx: Prisma.TransactionClient, appointmentId: string) {
    const appointment = await tx.appointment.findUnique({
      where: {
        id: appointmentId
      }
    });

    if (!appointment) {
      throw new NotFoundException({
        error: 'Appointment not found',
        code: 'APPOINTMENT_NOT_FOUND'
      });
    }

    return appointment;
  }

  private resolveTargetStatus(payload: ReviewStaffAppointmentDto): AppointmentStatus {
    const normalizedStatus = `${payload.status || ''}`.trim().toLowerCase();
    const normalizedAction = `${payload.action || ''}`.trim().toLowerCase();

    if (normalizedStatus === 'approved' || normalizedAction === 'approve') {
      return AppointmentStatus.APPROVED;
    }

    if (normalizedStatus === 'rejected' || normalizedAction === 'reject') {
      return AppointmentStatus.REJECTED;
    }

    if (normalizedStatus === 'cancelled' || normalizedStatus === 'canceled' || normalizedAction === 'cancel') {
      return AppointmentStatus.CANCELLED;
    }

    if (normalizedStatus === 'completed' || normalizedAction === 'complete') {
      return AppointmentStatus.COMPLETED;
    }

    if (
      normalizedStatus === 'no_show' ||
      normalizedStatus === 'no-show' ||
      normalizedStatus === 'noshow' ||
      normalizedAction === 'no_show' ||
      normalizedAction === 'mark_no_show'
    ) {
      return AppointmentStatus.NO_SHOW;
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
