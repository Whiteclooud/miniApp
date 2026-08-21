const STORAGE_KEY = 'miniapp.customerOpenId';
const DISABLED_STORAGE_KEY = 'miniapp.customerOpenId.disabled';
const DEFAULT_DEVELOP_CUSTOMER_OPENID = 'customer-openid-demo';
const { getCurrentUser, isWechatAuthEnabled } = require('./auth');

function getEnvProfile() {
  try {
    const accountInfo = wx.getAccountInfoSync();
    return {
      appId: accountInfo.miniProgram.appId || '',
      envVersion: accountInfo.miniProgram.envVersion || 'develop'
    };
  } catch (error) {
    return {
      appId: 'touristappid',
      envVersion: 'develop'
    };
  }
}

function isDevelopEnv() {
  const profile = getEnvProfile();
  return profile.envVersion !== 'release' || profile.appId === 'touristappid';
}

function createMockOpenId() {
  return `mock-customer-openid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildIdentity(openId, extra = {}) {
  const nextOpenId = (openId || '').trim();
  if (!nextOpenId) {
    return {
      openId: '',
      source: extra.source || 'missing',
      isMock: false,
      isDefaultMock: false,
      isSession: !!extra.isSession,
      canUse: false,
      label: extra.label || '未设置顾客 OpenID'
    };
  }

  const isDefaultMock = nextOpenId === DEFAULT_DEVELOP_CUSTOMER_OPENID;
  const isMock = isDefaultMock || nextOpenId.indexOf('mock-customer-openid-') === 0;
  return {
    openId: nextOpenId,
    source: extra.source || (isDefaultMock ? 'mock-default' : isMock ? 'mock' : 'real'),
    isMock,
    isDefaultMock,
    isSession: !!extra.isSession,
    canUse: true,
    label: extra.label || (isDefaultMock
      ? '开发环境默认顾客 OpenID'
      : isMock
        ? '开发环境模拟顾客 OpenID'
        : '微信顾客 OpenID')
  };
}

function buildSessionPendingIdentity() {
  return {
    openId: '',
    source: 'session-pending',
    isMock: false,
    isDefaultMock: false,
    isSession: true,
    canUse: true,
    label: '正在使用微信顾客会话'
  };
}

function shouldUseBearerSession() {
  try {
    return isWechatAuthEnabled();
  } catch (_error) {
    return !isDevelopEnv();
  }
}

function isDevelopFallbackDisabled() {
  return wx.getStorageSync(DISABLED_STORAGE_KEY) === '1';
}

function getStoredCustomerIdentity() {
  const stored = wx.getStorageSync(STORAGE_KEY);
  return buildIdentity(stored);
}

function ensureCustomerIdentity(options = {}) {
  const { persistDevelopFallback = false } = options;
  const currentUser = getCurrentUser();
  const currentRole = `${currentUser && currentUser.role || ''}`.trim().toLowerCase();

  if (currentUser && currentRole === 'customer' && `${currentUser.openId || ''}`.trim()) {
    return buildIdentity(currentUser.openId, {
      source: 'session',
      isSession: true,
      label: '微信顾客会话'
    });
  }

  // Do not let a stale local OpenID masquerade as the identity of a valid
  // non-customer Bearer session.
  if (currentUser) {
    return buildIdentity('', {
      source: 'session-non-customer',
      isSession: true,
      label: '当前微信账号不是顾客'
    });
  }

  const storedIdentity = getStoredCustomerIdentity();
  if (storedIdentity.canUse) {
    return storedIdentity;
  }

  if (shouldUseBearerSession()) {
    return buildSessionPendingIdentity();
  }

  if (!isDevelopEnv() || isDevelopFallbackDisabled()) {
    return storedIdentity;
  }

  if (persistDevelopFallback) {
    wx.removeStorageSync(DISABLED_STORAGE_KEY);
    wx.setStorageSync(STORAGE_KEY, DEFAULT_DEVELOP_CUSTOMER_OPENID);
  }

  return buildIdentity(DEFAULT_DEVELOP_CUSTOMER_OPENID, {
    source: 'mock-default'
  });
}

function setCustomerOpenId(openId) {
  const nextOpenId = (openId || '').trim();
  wx.removeStorageSync(DISABLED_STORAGE_KEY);

  if (nextOpenId) {
    wx.setStorageSync(STORAGE_KEY, nextOpenId);
    return buildIdentity(nextOpenId);
  }

  wx.removeStorageSync(STORAGE_KEY);
  return ensureCustomerIdentity({ persistDevelopFallback: true });
}

function clearCustomerOpenId() {
  wx.removeStorageSync(STORAGE_KEY);
  if (isDevelopEnv()) {
    wx.setStorageSync(DISABLED_STORAGE_KEY, '1');
  }
  return buildIdentity('');
}

function getCustomerIdentityOrThrow() {
  const identity = ensureCustomerIdentity();
  if (identity.canUse) {
    return identity;
  }

  const error = new Error(
    isDevelopEnv()
      ? '未获取到顾客 OpenID。开发环境请填写或生成模拟顾客 OpenID。'
      : '未获取到顾客 OpenID，请重新进入小程序后重试。'
  );
  error.code = 'CUSTOMER_OPENID_MISSING';
  error.statusCode = 401;
  error.isUnauthorized = true;
  throw error;
}

module.exports = {
  STORAGE_KEY,
  DISABLED_STORAGE_KEY,
  DEFAULT_DEVELOP_CUSTOMER_OPENID,
  isDevelopEnv,
  createMockOpenId,
  ensureCustomerIdentity,
  setCustomerOpenId,
  clearCustomerOpenId,
  getCustomerIdentityOrThrow
};
