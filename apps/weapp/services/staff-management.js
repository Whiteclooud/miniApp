const { request } = require('../utils/request');

function listStaffMembers() {
  return request({
    url: '/api/v1/staff/members',
    auth: 'staff'
  });
}

function removeStaffMember(memberId) {
  return request({
    url: `/api/v1/staff/members/${encodeURIComponent(memberId)}`,
    method: 'DELETE',
    auth: 'staff'
  });
}

function listStaffInvitations() {
  return request({
    url: '/api/v1/staff/invitations',
    auth: 'staff'
  });
}

function createStaffInvitation(payload = {}) {
  return request({
    url: '/api/v1/staff/invitations',
    method: 'POST',
    data: payload,
    auth: 'staff'
  });
}

function revokeStaffInvitation(invitationId) {
  return request({
    url: `/api/v1/staff/invitations/${encodeURIComponent(invitationId)}`,
    method: 'DELETE',
    auth: 'staff'
  });
}

function redeemStaffInvitation(code) {
  return request({
    url: '/api/v1/staff/invitations/redeem',
    method: 'POST',
    data: { code },
    auth: 'customer'
  });
}

module.exports = {
  listStaffMembers,
  removeStaffMember,
  listStaffInvitations,
  createStaffInvitation,
  revokeStaffInvitation,
  redeemStaffInvitation
};
