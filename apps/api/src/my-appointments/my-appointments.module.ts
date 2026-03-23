import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MyAppointmentsController } from './my-appointments.controller';
import { MyAppointmentsService } from './my-appointments.service';

@Module({
  imports: [PrismaModule],
  controllers: [MyAppointmentsController],
  providers: [MyAppointmentsService]
})
export class MyAppointmentsModule {}
