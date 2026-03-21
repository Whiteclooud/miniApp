import { Module } from '@nestjs/common';
import { MyAppointmentsController } from './my-appointments.controller';
import { MyAppointmentsService } from './my-appointments.service';

@Module({
  controllers: [MyAppointmentsController],
  providers: [MyAppointmentsService]
})
export class MyAppointmentsModule {}
