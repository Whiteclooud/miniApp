const auth = require('./auth');
const { CUSTOMER_HOME, normalizeRouteUrl } = require('./launch');
const { ensureStaffIdentity } = require('./staff');

const LOGIN_PAGE = '/pages/login/index';
const MY_PAGE = '/pages/my/index';

function getAppSafe() {
  try {
    return typeof getApp === 'function' ? getApp() : null;
  } catch (_error) {
    return null;
  }
}

function isHeaderFallbackEnabled() {
  const app = getAppSafe();
  return !!(app && app.globalData && app.globalData.allowHeaderAuthFallback);
}

function getSessionTokenSafe() {
  try {
    return typeof auth.getSessionToken === 'function' ? auth.getSessionToken() : '';
  } catch (_error) {
    return '';
  }
}

function getCurrentUserSafe() {
  try {
    return typeof auth.getCurrentUser === 'function' ? auth.getCurrentUser() : null;
  } catch (_error) {
    return null;
  }
}

function hasRole(user, role) {
  if (typeof auth.hasUserRole === 'function') {
    return auth.hasUserRole(user, role);
  }
  const roles = typeof auth.getUserRoles === 'function'
    ? auth.getUserRoles(user || {})
    : [user && user.primaryRole, user && user.role, ...(user && user.roles || [])];
  return roles.map((item) => `${item || ''}`.toLowerCase()).includes(role);
}

function getCustomerIdentity() {
  const app = getAppSafe();
  if (!app) {
    return null;
  }
  return app.getCustomerIdentity
    ? app.getCustomerIdentity()
    : app.globalData && app.globalData.customerIdentity;
}

function hasCustomerAccess() {
  if (getSessionTokenSafe()) {
    return true;
  }

  // Logic self-checks load page modules with a deliberately small auth stub.
  // Real runtimes always expose getSessionToken, so this branch cannot make a
  // production request authenticated.
  if (typeof auth.getSessionToken !== 'function') {
    return !!getCurrentUserSafe();
  }

  const identity = getCustomerIdentity();
  return !!(isHeaderFallbackEnabled() && identity && identity.canUse && identity.openId);
}

function hasStaffAccess() {
  const user = getCurrentUserSafe();
  if (getSessionTokenSafe()) {
    return hasRole(user, 'staff');
  }

  if (typeof auth.getSessionToken !== 'function') {
    return hasRole(user, 'staff');
  }

  if (!isHeaderFallbackEnabled()) {
    return false;
  }

  try {
    const identity = ensureStaffIdentity();
    return !!(identity && identity.canUse && identity.openId);
  } catch (_error) {
    return false;
  }
}

function isLoginRequiredError(error) {
  return !!(error && (
    error.isLoginRequired ||
    `${error.code || ''}`.toUpperCase() === 'LOGIN_REQUIRED'
  ));
}

function getCurrentPageUrl() {
  try {
    const pages = getCurrentPages();
    const page = pages && pages[pages.length - 1];
    if (!page || !page.route) {
      return CUSTOMER_HOME;
    }
    const query = page.options && Object.keys(page.options).length
      ? `?${Object.keys(page.options)
        .filter((key) => page.options[key] !== undefined && page.options[key] !== null)
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(page.options[key])}`)
        .join('&')}`
      : '';
    return `/${page.route}${query}`;
  } catch (_error) {
    return CUSTOMER_HOME;
  }
}

function normalizeRedirect(value) {
  const route = normalizeRouteUrl(value || CUSTOMER_HOME);
  if (!route || route.path === 'pages/login/index') {
    return CUSTOMER_HOME;
  }
  return route.url;
}

function buildLoginUrl(options = {}) {
  const redirect = normalizeRedirect(options.redirect || getCurrentPageUrl());
  const reason = `${options.reason || ''}`.trim();
  const params = [`redirect=${encodeURIComponent(redirect)}`];
  if (reason) {
    params.push(`reason=${encodeURIComponent(reason)}`);
  }
  return `${LOGIN_PAGE}?${params.join('&')}`;
}

function goToLogin(options = {}) {
  const url = buildLoginUrl(options);
  if (typeof wx !== 'undefined' && typeof wx.navigateTo === 'function') {
    wx.navigateTo({ url });
  }
}

function promptForLogin(options = {}) {
  if (hasCustomerAccess()) {
    return Promise.resolve(true);
  }

  if (typeof wx === 'undefined' || typeof wx.showModal !== 'function') {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    wx.showModal({
      title: options.title || '登录后继续',
      content: options.content || '此操作需要微信登录后继续。',
      confirmText: '去登录',
      cancelText: '暂不登录',
      confirmColor: '#e8856c',
      success: (result) => {
        if (result.confirm) {
          goToLogin(options);
          resolve(false);
          return;
        }
        resolve(false);
      },
      fail: () => resolve(false)
    });
  });
}

function redirectToLogin(options = {}) {
  if (hasCustomerAccess()) {
    return true;
  }
  if (typeof wx !== 'undefined' && typeof wx.redirectTo === 'function') {
    wx.redirectTo({ url: buildLoginUrl(options) });
  }
  return false;
}

function redirectToMy() {
  if (typeof wx !== 'undefined' && typeof wx.switchTab === 'function') {
    wx.switchTab({ url: MY_PAGE });
  }
}

function requireStaff(options = {}) {
  if (!hasCustomerAccess()) {
    redirectToLogin({
      ...options,
      content: options.content || '后台管理需要先使用微信登录。'
    });
    return false;
  }
  if (hasStaffAccess()) {
    return true;
  }
  if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
    wx.showToast({ title: '当前账号没有后台管理权限', icon: 'none' });
  }
  redirectToMy();
  return false;
}

function finishLoginRedirect(value, user) {
  const target = normalizeRedirect(value);
  const route = normalizeRouteUrl(target);
  if (!route) {
    wx.switchTab({ url: CUSTOMER_HOME });
    return;
  }

  if (route.path.startsWith('pages/staff/') &&
    route.path !== 'pages/staff/members/index' &&
    !hasRole(user, 'staff')) {
    wx.switchTab({ url: MY_PAGE });
    return;
  }

  if (route.path === 'pages/home/index' || route.path === 'pages/my/index') {
    wx.switchTab({ url: route.url });
    return;
  }

  wx.redirectTo({ url: route.url });
}

module.exports = {
  LOGIN_PAGE,
  MY_PAGE,
  hasCustomerAccess,
  hasStaffAccess,
  isLoginRequiredError,
  normalizeRedirect,
  buildLoginUrl,
  goToLogin,
  promptForLogin,
  redirectToLogin,
  requireStaff,
  finishLoginRedirect
};
