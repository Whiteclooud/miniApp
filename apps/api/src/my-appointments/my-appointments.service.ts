import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function mapAppointmentStatus(status: AppointmentStatus) {
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

    return rows.map((item) => ({
      id: item.id,
      customerOpenId: item.customerOpenId,
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
