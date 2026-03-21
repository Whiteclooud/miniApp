import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StaffAppointmentsController } from './staff-appointments.controller';
import { StaffAppointmentsService } from './staff-appointments.service';

@Module({
  imports: [PrismaModule],
  controllers: [StaffAppointmentsController],
  providers: [StaffAppointmentsService],
  exports: [StaffAppointmentsService]
})
export class StaffAppointmentsModule {}
