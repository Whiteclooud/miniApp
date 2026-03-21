import { Injectable } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function mapAppointmentStatus(status: AppointmentStatus): 'pending' | 'approved' | 'rejected' {
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

@Injectable()
export class MyAppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listByCustomerOpenId(customerOpenId: string) {
    const rows = await this.prisma.appointment.findMany({
      where: {
        customerOpenId
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });

    return rows.map((row) => ({
      id: row.id,
      customerOpenId: row.customerOpenId,
      customerName: row.customerName ?? '',
      phone: row.phone ?? '',
      date: row.date,
      timeSlot: row.timeSlot,
      note: row.note ?? '',
      status: mapAppointmentStatus(row.status),
      createdAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
      reviewedBy: row.reviewedByOpenId ?? null,
      reviewNote: row.reviewNote ?? ''
    }));
  }
}
