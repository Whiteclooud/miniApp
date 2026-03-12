const { request } = require('../utils/request');

function listServices() {
  return request({ url: '/api/v1/services' });
}

function listAppointments() {
  return request({ url: '/api/v1/appointments' });
}

function createAppointment(payload) {
  return request({
    url: '/api/v1/appointments',
    method: 'POST',
    data: payload
  });
}

module.exports = {
  listServices,
  listAppointments,
  createAppointment
};
