import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_STATUS = 'pending';
const ALLOWED_STATUS_VALUES = ['pending', 'approved', 'rejected'] as const;

type ListStatus = (typeof ALLOWED_STATUS_VALUES)[number];

function resolveAllowedStaffIds(): string[] {
  const values = [process.env.STAFF_OPEN_IDS, process.env.STAFF_OPEN_ID, 'staff-openid-demo']
    .filter(Boolean)
    .flatMap((value) => `${value}`.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(values)];
}

function mapAppointmentStatus(status: AppointmentStatus): ListStatus {
  switch (status) {
    case AppointmentStatus.APPROVED:
      return 'approved';
    case AppointmentStatus.REJECTED:
      return 'rejected';
    case AppointmentStatus.PENDING:
    default:
      return 'pending';
  }
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

  private assertStaffAuthorized(staffOpenId?: string) {
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

    return rows.map((item) => ({
      id: item.id,
      customerOpenId: item.customerOpenId || '',
      customerName: item.customerName ?? '',
      phone: item.phone ?? '',
      date: item.date,
      timeSlot: item.timeSlot,
      note: item.note ?? '',
      status: mapAppointmentStatus(item.status),
      createdAt: item.createdAt.toISOString(),
      reviewedAt: item.reviewedAt ? item.reviewedAt.toISOString() : null,
      reviewedBy: item.reviewedByOpenId ?? null,
      reviewNote: item.reviewNote ?? ''
    }));
  }
}
