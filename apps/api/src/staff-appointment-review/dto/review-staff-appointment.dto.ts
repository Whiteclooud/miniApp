export interface ReviewStaffAppointmentDto {
  status?: string;
  action?: string;
  reviewNote?: string;
}

export interface RescheduleStaffAppointmentDto {
  appointmentDate?: string;
  date?: string;
  timeSlot?: string;
  reviewNote?: string;
}
