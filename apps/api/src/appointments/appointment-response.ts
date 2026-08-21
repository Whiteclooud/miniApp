import { Appointment, AppointmentStatus } from '@prisma/client';

export type ApiAppointmentStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'completed'
  | 'no_show';

const ARRIVAL_INSTRUCTIONS = {
  title: '到店说明',
  address: process.env.STORE_ADDRESS || '请在门店资料中配置到店地址',
  contact: process.env.STORE_CONTACT || '请在门店资料中配置联系电话',
  notes: [
    '请按预约时间到店，建议提前 5-10 分钟到达。',
    '如需取消或改期，请尽早在小程序内操作或联系门店。',
    '迟到超过 15 分钟时，门店可根据当天排期调整或取消本次预约。'
  ]
};

export interface ApiAppointmentItem {
  id: string;
  customerOpenId: string;
  customerName: string;
  phone: string;
  date: string;
  timeSlot: string;
  note: string;
  referenceImageUrls: string[];
  status: ApiAppointmentStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string;
  arrivalInstructions: typeof ARRIVAL_INSTRUCTIONS | null;
}

function parseReferenceImageUrls(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && !!item.trim())
      : [];
  } catch (_error) {
    return [];
  }
}

export function mapAppointmentStatus(status: AppointmentStatus): ApiAppointmentStatus {
  switch (status) {
    case AppointmentStatus.APPROVED:
      return 'approved';
    case AppointmentStatus.REJECTED:
      return 'rejected';
    case AppointmentStatus.CANCELLED:
      return 'cancelled';
    case AppointmentStatus.COMPLETED:
      return 'completed';
    case AppointmentStatus.NO_SHOW:
      return 'no_show';
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
    referenceImageUrls: parseReferenceImageUrls(item.referenceImageUrlsJson),
    status: mapAppointmentStatus(item.status),
    createdAt: item.createdAt.toISOString(),
    reviewedAt: item.reviewedAt ? item.reviewedAt.toISOString() : null,
    reviewedBy: item.reviewedByOpenId ?? null,
    reviewNote: item.reviewNote ?? '',
    cancelledAt: item.cancelledAt ? item.cancelledAt.toISOString() : null,
    cancelledBy: item.cancelledByOpenId ?? null,
    cancelReason: item.cancelReason ?? '',
    arrivalInstructions: item.status === AppointmentStatus.APPROVED ? ARRIVAL_INSTRUCTIONS : null
  };
}
