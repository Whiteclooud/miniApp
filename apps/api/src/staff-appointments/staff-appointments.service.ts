import { AppointmentStatus, Prisma } from '@prisma/client';
import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  ApiAppointmentItem,
  mapAppointmentStatus,
  toApiAppointmentItem
} from '../appointments/appointment-response';
import { isDateText } from '../booking-rules/booking-rules.shared';
import { PrismaService } from '../prisma/prisma.service';
import { assertStaffAuthorized } from '../staff-auth/staff-auth';
import { ListStaffAppointmentsQuery } from './dto/list-staff-appointments.query';

const ALLOWED_STATUS_VALUES = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'completed',
  'no_show'
] as const;

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
    case 'cancelled':
      return AppointmentStatus.CANCELLED;
    case 'completed':
      return AppointmentStatus.COMPLETED;
    case 'no_show':
      return AppointmentStatus.NO_SHOW;
    case 'pending':
    default:
      return AppointmentStatus.PENDING;
  }
}

function validateDateQuery(value?: string, code = 'INVALID_DATE') {
  const normalized = `${value || ''}`.trim();
  if (!normalized) {
    return '';
  }

  if (!isDateText(normalized)) {
    throw new BadRequestException({
      error: 'Invalid date',
      code
    });
  }

  return normalized;
}

function buildWhereFromQuery(query: ListStaffAppointmentsQuery = {}) {
  const normalizedStatus = toPrismaAppointmentStatus(query.status);
  const keyword = `${query.keyword || ''}`.trim();
  const date = validateDateQuery(query.date);
  // An exact date takes precedence over a range. Ignore range values entirely
  // in that mode so stale picker values cannot make a valid query fail.
  const dateFrom = date ? '' : validateDateQuery(query.dateFrom, 'INVALID_DATE_FROM');
  const dateTo = date ? '' : validateDateQuery(query.dateTo, 'INVALID_DATE_TO');

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new BadRequestException({
      error: 'dateFrom must be before or equal to dateTo',
      code: 'INVALID_DATE_RANGE'
    });
  }

  const where: Prisma.AppointmentWhereInput = {};

  if (normalizedStatus) {
    where.status = normalizedStatus;
  }

  if (date) {
    where.date = date;
  } else if (dateFrom || dateTo) {
    where.date = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {})
    };
  }

  if (keyword) {
    where.OR = [
      { customerName: { contains: keyword } },
      { phone: { contains: keyword } },
      { customerOpenId: { contains: keyword } }
    ];
  }

  return where;
}

function mapAuditStatus(status: AppointmentStatus | null) {
  return status ? mapAppointmentStatus(status) : null;
}

@Injectable()
export class StaffAppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  assertStaffAuthorized(staffOpenId?: string) {
    return assertStaffAuthorized(staffOpenId);
  }

  async listStaffAppointments(
    staffOpenId?: string,
    statusOrQuery?: string | ListStaffAppointmentsQuery
  ) {
    this.assertStaffAuthorized(staffOpenId);
    const query =
      typeof statusOrQuery === 'string'
        ? { status: statusOrQuery }
        : statusOrQuery || {};
    const where = buildWhereFromQuery(query);

    const rows = await this.prisma.appointment.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }]
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

  async listStaffAppointmentAuditLogs(staffOpenId?: string, appointmentId?: string) {
    this.assertStaffAuthorized(staffOpenId);
    const normalizedAppointmentId = `${appointmentId || ''}`.trim();

    if (!normalizedAppointmentId) {
      throw new NotFoundException({
        error: 'Appointment not found',
        code: 'APPOINTMENT_NOT_FOUND'
      });
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: {
        id: normalizedAppointmentId
      },
      select: {
        id: true
      }
    });

    if (!appointment) {
      throw new NotFoundException({
        error: 'Appointment not found',
        code: 'APPOINTMENT_NOT_FOUND'
      });
    }

    const rows = await this.prisma.appointmentAuditLog.findMany({
      where: {
        appointmentId: normalizedAppointmentId
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });

    return rows.map((item) => ({
      id: item.id,
      appointmentId: item.appointmentId,
      actorOpenId: item.actorOpenId || '',
      actorRole: item.actorRole,
      action: item.action,
      fromStatus: mapAuditStatus(item.fromStatus),
      toStatus: mapAuditStatus(item.toStatus),
      fromDate: item.fromDate || '',
      toDate: item.toDate || '',
      fromTimeSlot: item.fromTimeSlot || '',
      toTimeSlot: item.toTimeSlot || '',
      note: item.note || '',
      createdAt: item.createdAt.toISOString()
    }));
  }

  toStaffAppointmentItem(item: any): StaffAppointmentItem {
    return toApiAppointmentItem(item);
  }
}
