const { request, uploadFiles } = require('../utils/request');

function listGallery(params = {}) {
  return request({
    url: '/api/v1/gallery',
    params
  });
}

function listStaffGallery() {
  return request({
    url: '/api/v1/staff/gallery',
    auth: 'staff'
  });
}

function createStaffGallery(payload = {}) {
  return request({
    url: '/api/v1/staff/gallery',
    method: 'POST',
    data: payload,
    auth: 'staff'
  });
}

function updateStaffGallery(itemId, payload = {}) {
  return request({
    url: `/api/v1/staff/gallery/${itemId}`,
    method: 'PATCH',
    data: payload,
    auth: 'staff'
  });
}

function uploadStaffGalleryImages(filePaths = []) {
  return uploadFiles({
    url: '/api/v1/staff/uploads/images',
    filePaths,
    name: 'files',
    auth: 'staff'
  });
}

function getAvailability(date) {
  return request({
    url: '/api/v1/availability',
    params: date ? { date } : undefined
  });
}

function createAppointment(payload = {}) {
  const data = {
    appointmentDate: payload.appointmentDate,
    timeSlot: payload.timeSlot
  };

  if (payload.customerName !== undefined) {
    data.customerName = payload.customerName;
  }

  if (payload.phone !== undefined) {
    data.phone = payload.phone;
  }

  if (payload.note !== undefined) {
    data.note = payload.note;
  }

  return request({
    url: '/api/v1/appointments',
    method: 'POST',
    data,
    auth: 'customer'
  });
}

function listMyAppointments() {
  return request({
    url: '/api/v1/my/appointments',
    auth: 'customer'
  });
}

function cancelMyAppointment(appointmentId, payload = {}) {
  return request({
    url: `/api/v1/my/appointments/${appointmentId}/cancel`,
    method: 'PATCH',
    data: payload,
    auth: 'customer'
  });
}

function listStaffRules() {
  return request({
    url: '/api/v1/staff/booking-rules',
    auth: 'staff'
  });
}

function updateStaffRules(payload) {
  return request({
    url: '/api/v1/staff/booking-rules',
    method: 'PUT',
    data: payload,
    auth: 'staff'
  });
}

function listStaffAppointments(params = {}) {
  return request({
    url: '/api/v1/staff/appointments',
    params,
    auth: 'staff'
  });
}

function reviewStaffAppointment(appointmentId, payload, method = 'PATCH') {
  return request({
    url: `/api/v1/staff/appointments/${appointmentId}/review`,
    method,
    data: payload,
    auth: 'staff'
  });
}

function rescheduleStaffAppointment(appointmentId, payload = {}) {
  return request({
    url: `/api/v1/staff/appointments/${appointmentId}/reschedule`,
    method: 'PATCH',
    data: payload,
    auth: 'staff'
  });
}

function listStaffAppointmentAuditLogs(appointmentId) {
  return request({
    url: `/api/v1/staff/appointments/${appointmentId}/audit-logs`,
    auth: 'staff'
  });
}

module.exports = {
  listGallery,
  listStaffGallery,
  createStaffGallery,
  updateStaffGallery,
  uploadStaffGalleryImages,
  getAvailability,
  createAppointment,
  listMyAppointments,
  cancelMyAppointment,
  listStaffRules,
  updateStaffRules,
  listStaffAppointments,
  reviewStaffAppointment,
  rescheduleStaffAppointment,
  listStaffAppointmentAuditLogs
};
