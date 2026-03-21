import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { MyAppointmentsService } from './my-appointments.service';

@Controller('api/v1/my/appointments')
export class MyAppointmentsController {
  constructor(private readonly myAppointmentsService: MyAppointmentsService) {}

  @Get()
  async listMyAppointments(@Headers('x-customer-openid') customerOpenId?: string) {
    const normalizedCustomerOpenId = `${customerOpenId || ''}`.trim();

    if (!normalizedCustomerOpenId) {
      throw new UnauthorizedException({
        error: 'Customer unauthorized',
        code: 'CUSTOMER_UNAUTHORIZED'
      });
    }

    const items = await this.myAppointmentsService.listByCustomerOpenId(normalizedCustomerOpenId);
    return { items };
  }
}
