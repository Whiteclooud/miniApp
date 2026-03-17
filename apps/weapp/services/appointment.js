const { request } = require('../utils/request');

function listGallery() {
  return request({
    url: '/api/v1/gallery'
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

module.exports = {
  listGallery,
  getAvailability,
  createAppointment,
  listMyAppointments,
  listStaffRules,
  updateStaffRules,
  listStaffAppointments,
  reviewStaffAppointment
};
