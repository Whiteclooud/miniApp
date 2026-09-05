import { Body, Controller, Headers, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Controller('api/v1/appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly authService: AuthService
  ) {}

  @Post()
  async createAppointment(
    @Headers('authorization') authorization?: string,
    @Headers('x-customer-openid') customerOpenId?: string,
    @Body() payload: CreateAppointmentDto = {}
  ) {
    const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const resolvedCustomerOpenId = await this.authService.resolveCustomerOpenId(
      authorization,
      customerOpenId
    );
    const item = await this.appointmentsService.createAppointment(resolvedCustomerOpenId, body);
    return { item };
  }
}
