import { Injectable, UnauthorizedException } from '@nestjs/common';
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
}
