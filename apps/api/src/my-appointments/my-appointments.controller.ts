import { Controller, Get, Headers } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { MyAppointmentsService } from './my-appointments.service';

@Controller('api/v1/my/appointments')
export class MyAppointmentsController {
  constructor(
    private readonly myAppointmentsService: MyAppointmentsService,
    private readonly authService: AuthService
  ) {}

  @Get()
  async listMyAppointments(
    @Headers('authorization') authorization?: string,
    @Headers('x-customer-openid') customerOpenId?: string
  ) {
    const resolvedCustomerOpenId = await this.authService.resolveCustomerOpenId(
      authorization,
      customerOpenId
    );
    const items = await this.myAppointmentsService.listMyAppointments(resolvedCustomerOpenId);
    return { items };
  }
}
