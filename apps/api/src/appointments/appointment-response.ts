import { Appointment, AppointmentStatus } from '@prisma/client';

export type ApiAppointmentStatus = 'pending' | 'approved' | 'rejected';

export interface ApiAppointmentItem {
  id: string;
  customerOpenId: string;
  customerName: string;
  phone: string;
  date: string;
  timeSlot: string;
  note: string;
  status: ApiAppointmentStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string;
}

export function mapAppointmentStatus(status: AppointmentStatus): ApiAppointmentStatus {
  switch (status) {
    case AppointmentStatus.APPROVED:
      return 'approved';
    case AppointmentStatus.REJECTED:
      return 'rejected';
    case AppointmentStatus.PENDING:
    default:
      return 'pending';
  }
}

export function toApiAppointmentItem(item: Appointment): ApiAppointmentItem {
  return {
    id: item.id,
    customerOpenId: item.customerOpenId || '',
    customerName: item.customerName ?? '',
    phone: item.phone ?? '',
    date: item.date,
    timeSlot: item.timeSlot,
    note: item.note ?? '',
    status: mapAppointmentStatus(item.status),
    createdAt: item.createdAt.toISOString(),
    reviewedAt: item.reviewedAt ? item.reviewedAt.toISOString() : null,
    reviewedBy: item.reviewedByOpenId ?? null,
    reviewNote: item.reviewNote ?? ''
  };
}
