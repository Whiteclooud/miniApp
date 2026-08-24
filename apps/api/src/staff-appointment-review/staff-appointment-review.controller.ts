import { Body, Controller, Headers, Param, Patch, Post } from '@nestjs/common';
import { AuthService, PERMISSIONS } from '../auth/auth.service';
import {
  RescheduleStaffAppointmentDto,
  ReviewStaffAppointmentDto
} from './dto/review-staff-appointment.dto';
import { StaffAppointmentReviewService } from './staff-appointment-review.service';

@Controller('api/v1/staff/appointments')
export class StaffAppointmentReviewController {
  constructor(
    private readonly staffAppointmentReviewService: StaffAppointmentReviewService,
    private readonly authService: AuthService
  ) {}

  @Post(':id/review')
  async reviewStaffAppointmentViaPost(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Param('id') appointmentId?: string,
    @Body() payload: ReviewStaffAppointmentDto = {}
  ) {
    const identity = await this.requireWrite(authorization, staffOpenId);
    const item = await this.staffAppointmentReviewService.reviewStaffAppointment(
      identity.openId,
      appointmentId,
      payload
    );
    return { item };
  }

  @Patch(':id/review')
  async reviewStaffAppointmentViaPatch(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Param('id') appointmentId?: string,
    @Body() payload: ReviewStaffAppointmentDto = {}
  ) {
    const identity = await this.requireWrite(authorization, staffOpenId);
    const item = await this.staffAppointmentReviewService.reviewStaffAppointment(
      identity.openId,
      appointmentId,
      payload
    );
    return { item };
  }

  @Patch(':id/reschedule')
  async rescheduleStaffAppointment(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Param('id') appointmentId?: string,
    @Body() payload: RescheduleStaffAppointmentDto = {}
  ) {
    const identity = await this.requireWrite(authorization, staffOpenId);
    const item = await this.staffAppointmentReviewService.rescheduleStaffAppointment(
      identity.openId,
      appointmentId,
      payload
    );
    return { item };
  }

  private requireWrite(authorization?: string, staffOpenId?: string) {
    return this.authService.requirePermission(
      authorization,
      PERMISSIONS.STAFF_APPOINTMENTS_WRITE,
      staffOpenId
    );
  }
}
