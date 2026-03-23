import { AppointmentStatus } from '@prisma/client';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import {
  ApiAppointmentItem,
  mapAppointmentStatus,
  toApiAppointmentItem
} from '../appointments/appointment-response';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_STATUS = 'pending';
const ALLOWED_STATUS_VALUES = ['pending', 'approved', 'rejected'] as const;

type ListStatus = (typeof ALLOWED_STATUS_VALUES)[number];

export type StaffAppointmentItem = ApiAppointmentItem;

function resolveAllowedStaffIds(): string[] {
  const values = [process.env.STAFF_OPEN_IDS, process.env.STAFF_OPEN_ID, 'staff-openid-demo']
    .filter(Boolean)
    .flatMap((value) => `${value}`.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(values)];
}

function toPrismaAppointmentStatus(status: string | undefined): AppointmentStatus {
  const normalizedStatus = `${status || DEFAULT_STATUS}`.trim().toLowerCase();

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
    const normalizedStaffOpenId = `${staffOpenId || ''}`.trim();
    const allowlist = resolveAllowedStaffIds();

    if (!normalizedStaffOpenId || !allowlist.includes(normalizedStaffOpenId)) {
      throw new UnauthorizedException({
        error: 'Staff unauthorized',
        code: 'STAFF_UNAUTHORIZED'
      });
    }

    return normalizedStaffOpenId;
  }

  async listStaffAppointments(staffOpenId?: string, status?: string) {
    this.assertStaffAuthorized(staffOpenId);
    const normalizedStatus = toPrismaAppointmentStatus(status);

    const rows = await this.prisma.appointment.findMany({
      where: {
        status: normalizedStatus
      },
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
