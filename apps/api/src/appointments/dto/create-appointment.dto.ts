export interface CreateAppointmentDto {
  appointmentDate?: string;
  date?: string;
  timeSlot?: string;
  customerName?: string;
  phone?: string;
  note?: string;
  referenceImageUrls?: string[];
  customerOpenId?: string;
}
