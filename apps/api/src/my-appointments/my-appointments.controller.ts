import { Controller, Get, Headers } from '@nestjs/common';
import { MyAppointmentsService } from './my-appointments.service';

@Controller('api/v1/my/appointments')
export class MyAppointmentsController {
  constructor(private readonly myAppointmentsService: MyAppointmentsService) {}

  @Get()
  async listMyAppointments(@Headers('x-customer-openid') customerOpenId?: string) {
    const items = await this.myAppointmentsService.listMyAppointments(customerOpenId);
    return { items };
  }
}
