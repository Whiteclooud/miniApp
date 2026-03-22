import { Body, Controller, Headers, Post } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Controller('api/v1/appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  async createAppointment(
    @Headers('x-customer-openid') customerOpenId?: string,
    @Body() payload: CreateAppointmentDto = {}
  ) {
    const item = await this.appointmentsService.createAppointment(customerOpenId, payload);
    return { item };
  }
}
