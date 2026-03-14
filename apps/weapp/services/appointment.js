const { request, staffRequest } = require('../utils/request');

function listGallery() {
  return request({ url: '/api/v1/gallery' });
}

function getAvailability(month) {
  return request({
    url: `/api/v1/availability?month=${encodeURIComponent(month)}`
  });
}

function createAppointment(payload) {
  return request({
    url: '/api/v1/appointments',
    method: 'POST',
    data: payload
  });
}

function listMyAppointments(phone) {
  return request({
    url: `/api/v1/my/appointments?phone=${encodeURIComponent(phone)}`
  });
}

function getBookingRules() {
  return staffRequest({ url: '/api/v1/staff/booking-rules' });
}

function updateBookingRules(payload) {
  return staffRequest({
    url: '/api/v1/staff/booking-rules',
    method: 'PUT',
    data: payload
  });
}

function listStaffAppointments(status = 'pending') {
  return staffRequest({
    url: `/api/v1/staff/appointments?status=${encodeURIComponent(status)}`
  });
}

function reviewAppointment(id, payload) {
  return staffRequest({
    url: `/api/v1/staff/appointments/${encodeURIComponent(id)}/review`,
    method: 'POST',
    data: payload
  });
}

module.exports = {
  listGallery,
  getAvailability,
  createAppointment,
  listMyAppointments,
  getBookingRules,
  updateBookingRules,
  listStaffAppointments,
  reviewAppointment
};
