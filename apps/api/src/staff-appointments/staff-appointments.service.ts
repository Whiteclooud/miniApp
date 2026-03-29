import { AppointmentStatus } from '@prisma/client';
import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { ApiAppointmentItem, toApiAppointmentItem } from '../appointments/appointment-response';
import { PrismaService } from '../prisma/prisma.service';
import { assertStaffAuthorized } from '../staff-auth/staff-auth';

const ALLOWED_STATUS_VALUES = ['pending', 'approved', 'rejected'] as const;

type ListStatus = (typeof ALLOWED_STATUS_VALUES)[number];

export type StaffAppointmentItem = ApiAppointmentItem;

function toPrismaAppointmentStatus(status?: string): AppointmentStatus | undefined {
  const normalizedStatus = `${status || ''}`.trim().toLowerCase();

  if (!normalizedStatus) {
    return undefined;
  }

  if (!ALLOWED_STATUS_VALUES.includes(normalizedStatus as ListStatus)) {
    throw new BadRequestException({
      error: 'Invalid status',
      code: 'INVALID_STATUS'
    });
  }

  switch (normalizedStatus) {
    case 'approved':
      return AppointmentStatus.APPROVED;
    case 'rejected':
      return AppointmentStatus.REJECTED;
    case 'pending':
    default:
      return AppointmentStatus.PENDING;
  }
}

@Injectable()
export class StaffAppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  assertStaffAuthorized(staffOpenId?: string) {
    return assertStaffAuthorized(staffOpenId);
  }

  async listStaffAppointments(staffOpenId?: string, status?: string) {
    this.assertStaffAuthorized(staffOpenId);
    const normalizedStatus = toPrismaAppointmentStatus(status);

    const rows = await this.prisma.appointment.findMany({
      where: normalizedStatus
        ? {
            status: normalizedStatus
          }
        : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });

    return rows.map((item) => this.toStaffAppointmentItem(item));
  }

  async getStaffAppointmentDetail(staffOpenId?: string, appointmentId?: string) {
    this.assertStaffAuthorized(staffOpenId);
    const normalizedAppointmentId = `${appointmentId || ''}`.trim();

    const appointment = normalizedAppointmentId
      ? await this.prisma.appointment.findUnique({
          where: {
            id: normalizedAppointmentId
          }
        })
      : null;

    if (!appointment) {
      throw new NotFoundException({
        error: 'Appointment not found',
        code: 'APPOINTMENT_NOT_FOUND'
      });
    }

    return this.toStaffAppointmentItem(appointment);
  }

  toStaffAppointmentItem(item: any): StaffAppointmentItem {
    return toApiAppointmentItem(item);
  }
}
