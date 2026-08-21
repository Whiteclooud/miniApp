const { request, uploadFiles } = require('../utils/request');
const { getCustomerReferenceImageFilename } = require('../utils/reference-images');

function listGallery(params = {}) {
  return request({
    url: '/api/v1/gallery',
    params
  });
}

function getGalleryDetail(itemId) {
  return request({
    url: `/api/v1/gallery/${encodeURIComponent(itemId)}`
  });
}

function listMyInspirations(params = {}) {
  return request({
    url: '/api/v1/my/inspirations',
    params,
    auth: 'customer'
  });
}

function getMyInspiration(inspirationId) {
  return request({
    url: `/api/v1/my/inspirations/${encodeURIComponent(inspirationId)}`,
    auth: 'customer'
  });
}

function createMyInspiration(payload = {}) {
  return request({
    url: '/api/v1/my/inspirations',
    method: 'POST',
    data: payload,
    auth: 'customer'
  });
}

function updateMyInspiration(inspirationId, payload = {}) {
  return request({
    url: `/api/v1/my/inspirations/${encodeURIComponent(inspirationId)}`,
    method: 'PATCH',
    data: payload,
    auth: 'customer'
  });
}

function deleteMyInspiration(inspirationId) {
  return request({
    url: `/api/v1/my/inspirations/${encodeURIComponent(inspirationId)}`,
    method: 'DELETE',
    auth: 'customer'
  });
}

function listStaffGallery() {
  return request({
    url: '/api/v1/staff/gallery',
    auth: 'staff'
  });
}

function getStaffGalleryDetail(itemId) {
  return request({
    url: `/api/v1/staff/gallery/${encodeURIComponent(itemId)}`,
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
    url: `/api/v1/staff/gallery/${encodeURIComponent(itemId)}`,
    method: 'PATCH',
    data: payload,
    auth: 'staff'
  });
}

function deleteStaffGallery(itemId) {
  return request({
    url: `/api/v1/staff/gallery/${encodeURIComponent(itemId)}`,
    method: 'DELETE',
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

async function uploadCustomerReferenceImages(filePaths = []) {
  const targets = (filePaths || []).filter(
    (filePath) => typeof filePath === 'string' && filePath.trim()
  );
  const uploadedItems = [];

  try {
    for (const filePath of targets) {
      const response = await uploadFiles({
        url: '/api/v1/uploads/images',
        filePaths: [filePath],
        name: 'files',
        auth: 'customer'
      });
      uploadedItems.push(...((response && response.items) || []));
    }
  } catch (error) {
    const uploadError = error && typeof error === 'object'
      ? error
      : new Error('参考图上传失败');
    uploadError.uploadedItems = uploadedItems.slice();
    throw uploadError;
  }

  return { items: uploadedItems };
}

function deleteCustomerReferenceImage(imageUrl) {
  const filename = getCustomerReferenceImageFilename(imageUrl);
  if (!filename) {
    return Promise.resolve({ item: null, skipped: true });
  }

  return request({
    url: `/api/v1/uploads/images/${encodeURIComponent(filename)}`,
    method: 'DELETE',
    auth: 'customer'
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

  if (payload.referenceImageUrls !== undefined) {
    data.referenceImageUrls = payload.referenceImageUrls;
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

function getStaffAppointmentDetail(appointmentId) {
  return request({
    url: `/api/v1/staff/appointments/${encodeURIComponent(appointmentId)}`,
    auth: 'staff'
  });
}

function reviewStaffAppointment(appointmentId, payload, method = 'PATCH') {
  return request({
    url: `/api/v1/staff/appointments/${encodeURIComponent(appointmentId)}/review`,
    method,
    data: payload,
    auth: 'staff'
  });
}

function rescheduleStaffAppointment(appointmentId, payload = {}) {
  return request({
    url: `/api/v1/staff/appointments/${encodeURIComponent(appointmentId)}/reschedule`,
    method: 'PATCH',
    data: payload,
    auth: 'staff'
  });
}

function listStaffAppointmentAuditLogs(appointmentId) {
  return request({
    url: `/api/v1/staff/appointments/${encodeURIComponent(appointmentId)}/audit-logs`,
    auth: 'staff'
  });
}

module.exports = {
  listGallery,
  getGalleryDetail,
  listMyInspirations,
  getMyInspiration,
  createMyInspiration,
  updateMyInspiration,
  deleteMyInspiration,
  listStaffGallery,
  getStaffGalleryDetail,
  createStaffGallery,
  updateStaffGallery,
  deleteStaffGallery,
  uploadStaffGalleryImages,
  uploadCustomerReferenceImages,
  deleteCustomerReferenceImage,
  getAvailability,
  createAppointment,
  listMyAppointments,
  cancelMyAppointment,
  listStaffRules,
  updateStaffRules,
  listStaffAppointments,
  getStaffAppointmentDetail,
  reviewStaffAppointment,
  rescheduleStaffAppointment,
  listStaffAppointmentAuditLogs
};
