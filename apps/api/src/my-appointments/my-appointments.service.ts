import { AppointmentStatus } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { toApiAppointmentItem } from '../appointments/appointment-response';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MyAppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertCustomerAuthorized(customerOpenId?: string) {
    const normalizedCustomerOpenId = `${customerOpenId || ''}`.trim();

    if (!normalizedCustomerOpenId) {
      throw new UnauthorizedException({
        error: 'Customer unauthorized',
        code: 'CUSTOMER_UNAUTHORIZED'
      });
    }

    return normalizedCustomerOpenId;
  }

  async listMyAppointments(customerOpenId?: string) {
    const normalizedCustomerOpenId = this.assertCustomerAuthorized(customerOpenId);

    const rows = await this.prisma.appointment.findMany({
      where: {
        customerOpenId: normalizedCustomerOpenId
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });

    return rows.map((item) => toApiAppointmentItem(item));
  }

  async cancelMyAppointment(customerOpenId?: string, appointmentId?: string, reason?: string) {
    const normalizedCustomerOpenId = this.assertCustomerAuthorized(customerOpenId);
    const normalizedAppointmentId = `${appointmentId || ''}`.trim();

    if (!normalizedAppointmentId) {
      throw new NotFoundException({
        error: 'Appointment not found',
        code: 'APPOINTMENT_NOT_FOUND'
      });
    }

    const normalizedReason = `${reason || ''}`.trim();

    const updated = await this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findFirst({
        where: {
          id: normalizedAppointmentId,
          customerOpenId: normalizedCustomerOpenId
        }
      });

      if (!appointment) {
        throw new NotFoundException({
          error: 'Appointment not found',
          code: 'APPOINTMENT_NOT_FOUND'
        });
      }

      if (
        appointment.status !== AppointmentStatus.PENDING &&
        appointment.status !== AppointmentStatus.APPROVED
      ) {
        throw new BadRequestException({
          error: 'Appointment cannot be cancelled',
          code: 'APPOINTMENT_NOT_CANCELLABLE'
        });
      }

      const next = await tx.appointment.update({
        where: {
          id: appointment.id
        },
        data: {
          status: AppointmentStatus.CANCELLED,
          approvedSlotKey: null,
          cancelledAt: new Date(),
          cancelledByOpenId: normalizedCustomerOpenId,
          cancelReason: normalizedReason || null
        }
      });

      await tx.appointmentAuditLog.create({
        data: {
          appointmentId: appointment.id,
          actorOpenId: normalizedCustomerOpenId,
          actorRole: 'customer',
          action: 'CUSTOMER_CANCEL',
          fromStatus: appointment.status,
          toStatus: AppointmentStatus.CANCELLED,
          fromDate: appointment.date,
          toDate: appointment.date,
          fromTimeSlot: appointment.timeSlot,
          toTimeSlot: appointment.timeSlot,
          note: normalizedReason || null
        }
      });

      return next;
    });

    return toApiAppointmentItem(updated);
  }
}
