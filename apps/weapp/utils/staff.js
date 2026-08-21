const { isDevelopEnv } = require('./customer');
const { getCurrentUser, isWechatAuthEnabled } = require('./auth');

const STORAGE_KEY = 'miniapp.staffOpenId';

function createMockStaffOpenId() {
  return `mock-staff-openid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildIdentity(openId, extra = {}) {
  const nextOpenId = (openId || '').trim();
  if (!nextOpenId) {
    return {
      openId: '',
      source: extra.source || 'missing',
      isMock: false,
      isSession: !!extra.isSession,
      canUse: false,
      label: extra.label || '未设置店员 OpenID'
    };
  }

  const isMock = nextOpenId.indexOf('mock-staff-openid-') === 0;
  return {
    openId: nextOpenId,
    source: extra.source || (isMock ? 'mock' : 'real'),
    isMock,
    isSession: !!extra.isSession,
    canUse: true,
    label: extra.label || (isMock ? '开发环境模拟店员 OpenID' : '店员 OpenID')
  };
}

function buildSessionPendingIdentity() {
  return {
    openId: '',
    source: 'session-pending',
    isMock: false,
    isSession: true,
    canUse: true,
    label: '正在使用微信店员会话'
  };
}

function shouldUseBearerSession() {
  try {
    return isWechatAuthEnabled();
  } catch (_error) {
    return !isDevelopEnv();
  }
}

function ensureStaffIdentity() {
  const currentUser = getCurrentUser();
  const currentRole = `${currentUser && currentUser.role || ''}`.trim().toLowerCase();

  if (currentUser && currentRole === 'staff' && `${currentUser.openId || ''}`.trim()) {
    return buildIdentity(currentUser.openId, {
      source: 'session',
      isSession: true,
      label: '微信店员会话'
    });
  }

  // A valid non-staff session must not fall back to a stale local OpenID. The
  // request layer will send the Bearer token and the API will return the
  // canonical STAFF_UNAUTHORIZED response.
  if (currentUser) {
    return buildIdentity('', {
      source: 'session-non-staff',
      isSession: true,
      label: '当前微信账号不是店员'
    });
  }

  const stored = wx.getStorageSync(STORAGE_KEY);
  if (stored) {
    return buildIdentity(stored, { source: 'storage' });
  }

  // In trial/release, request.js will obtain a Bearer session through
  // wx.login. Do not require a local OpenID before that flow can start.
  if (shouldUseBearerSession()) {
    return buildSessionPendingIdentity();
  }

  return buildIdentity('');
}

function setStaffOpenId(openId) {
  const nextOpenId = (openId || '').trim();
  if (nextOpenId) {
    wx.setStorageSync(STORAGE_KEY, nextOpenId);
    return buildIdentity(nextOpenId);
  }

  wx.removeStorageSync(STORAGE_KEY);
  return buildIdentity('');
}

function clearStaffOpenId() {
  wx.removeStorageSync(STORAGE_KEY);
  return buildIdentity('');
}

function getStaffIdentityOrThrow() {
  const identity = ensureStaffIdentity();
  if (identity.canUse) {
    return identity;
  }

  const error = new Error(
    isDevelopEnv()
      ? '未获取到店员 OpenID。开发环境请先在店员页手动设置模拟 OpenID。'
      : '未获取到店员 OpenID，请使用店员身份重新进入后重试。'
  );
  error.code = 'STAFF_OPENID_MISSING';
  error.statusCode = 401;
  error.isUnauthorized = true;
  throw error;
}

module.exports = {
  STORAGE_KEY,
  createMockStaffOpenId,
  ensureStaffIdentity,
  setStaffOpenId,
  clearStaffOpenId,
  getStaffIdentityOrThrow
};
