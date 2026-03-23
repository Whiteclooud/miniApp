import { Body, Controller, Headers, Param, Patch, Post } from '@nestjs/common';
import { ReviewStaffAppointmentDto } from './dto/review-staff-appointment.dto';
import { StaffAppointmentReviewService } from './staff-appointment-review.service';

@Controller('api/v1/staff/appointments')
export class StaffAppointmentReviewController {
  constructor(
    private readonly staffAppointmentReviewService: StaffAppointmentReviewService
  ) {}

  @Post(':id/review')
  async reviewStaffAppointmentViaPost(
    @Headers('x-staff-openid') staffOpenId?: string,
    @Param('id') appointmentId?: string,
    @Body() payload: ReviewStaffAppointmentDto = {}
  ) {
    const item = await this.staffAppointmentReviewService.reviewStaffAppointment(
      staffOpenId,
      appointmentId,
      payload
    );

    return { item };
  }

  @Patch(':id/review')
  async reviewStaffAppointmentViaPatch(
    @Headers('x-staff-openid') staffOpenId?: string,
    @Param('id') appointmentId?: string,
    @Body() payload: ReviewStaffAppointmentDto = {}
  ) {
    const item = await this.staffAppointmentReviewService.reviewStaffAppointment(
      staffOpenId,
      appointmentId,
      payload
    );

    return { item };
  }
}
