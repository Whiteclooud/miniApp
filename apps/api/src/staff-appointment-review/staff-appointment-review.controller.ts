import { Body, Controller, Headers, Param, Patch, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { ReviewStaffAppointmentDto } from './dto/review-staff-appointment.dto';
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
    const resolvedStaffOpenId = await this.authService.resolveStaffOpenId(authorization, staffOpenId);
    const item = await this.staffAppointmentReviewService.reviewStaffAppointment(
      resolvedStaffOpenId,
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
    const resolvedStaffOpenId = await this.authService.resolveStaffOpenId(authorization, staffOpenId);
    const item = await this.staffAppointmentReviewService.reviewStaffAppointment(
      resolvedStaffOpenId,
      appointmentId,
      payload
    );

    return { item };
  }
}
