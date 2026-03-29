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
import { PrismaService } from '../prisma/prisma.service';
import { StaffAppointmentsService } from '../staff-appointments/staff-appointments.service';
import { ReviewStaffAppointmentDto } from './dto/review-staff-appointment.dto';

type ReviewResultStatus = 'approved' | 'rejected';

export interface ReviewStaffAppointmentResultItem {
  id: string;
  status: ReviewResultStatus;
  reviewedAt: string;
  reviewedBy: string;
  reviewNote: string;
}

@Injectable()
export class StaffAppointmentReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffAppointmentsService: StaffAppointmentsService
  ) {}

  async reviewStaffAppointment(
    staffOpenId?: string,
    appointmentId?: string,
    payload: ReviewStaffAppointmentDto = {}
  ) {
    const normalizedStaffOpenId = this.staffAppointmentsService.assertStaffAuthorized(staffOpenId);
    const normalizedAppointmentId = `${appointmentId || ''}`.trim();

    if (!normalizedAppointmentId) {
      throw new NotFoundException({
        error: 'Appointment not found',
        code: 'APPOINTMENT_NOT_FOUND'
      });
    }

    const targetStatus = this.resolveTargetStatus(payload);
    const normalizedReviewNote = `${payload.reviewNote || ''}`.trim();

    const updatedAppointment = await this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findUnique({
        where: {
          id: normalizedAppointmentId
        }
      });

      if (!appointment) {
        throw new NotFoundException({
          error: 'Appointment not found',
          code: 'APPOINTMENT_NOT_FOUND'
        });
      }

      if (targetStatus === AppointmentStatus.APPROVED) {
        await this.assertSlotNotOccupied(tx, appointment);
      }

      return tx.appointment.update({
        where: {
          id: appointment.id
        },
        data: {
          status: targetStatus,
          reviewedAt: new Date(),
          reviewedByOpenId: normalizedStaffOpenId,
          reviewNote: normalizedReviewNote
        }
      });
    });

    return this.toReviewResultItem(updatedAppointment);
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

    throw new BadRequestException({
      error: 'Invalid review status',
      code: 'INVALID_REVIEW_STATUS'
    });
  }

  private async assertSlotNotOccupied(tx: Prisma.TransactionClient, appointment: Appointment) {
    const conflict = await tx.appointment.findFirst({
      where: {
        id: {
          not: appointment.id
        },
        date: appointment.date,
        timeSlot: appointment.timeSlot,
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

  private toReviewResultItem(item: Appointment): ReviewStaffAppointmentResultItem {
    return {
      id: item.id,
      status: item.status === AppointmentStatus.APPROVED ? 'approved' : 'rejected',
      reviewedAt: item.reviewedAt ? item.reviewedAt.toISOString() : new Date().toISOString(),
      reviewedBy: item.reviewedByOpenId ?? '',
      reviewNote: item.reviewNote ?? ''
    };
  }
}
