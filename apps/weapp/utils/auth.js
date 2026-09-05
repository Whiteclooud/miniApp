const STORAGE_KEY = 'miniapp.authSession';
const AUTH_REQUEST_TIMEOUT_MS = 15000;

let activeLoginPromise = null;
let runtimeApp = null;

function setAppContext(app) {
  if (app && app.globalData) {
    runtimeApp = app;
  }
  return runtimeApp;
}

function normalizeRole(role) {
  return `${role || ''}`
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

function normalizePermission(permission) {
  return `${permission || ''}`.trim().toLowerCase();
}

function getUserRoles(user) {
  if (!user || typeof user !== 'object') {
    return [];
  }

  const rawRoles = [];
  if (Array.isArray(user.roles)) {
    rawRoles.push(...user.roles.map((item) => {
      if (item && typeof item === 'object') {
        return item.role || item.name || '';
      }
      return item;
    }));
  }
  rawRoles.push(user.primaryRole, user.role);

  const roles = new Set(rawRoles.map(normalizeRole).filter(Boolean));
  if (roles.has('system_admin')) {
    roles.add('owner');
  }
  if (roles.has('owner')) {
    roles.add('staff');
  }
  if (roles.has('staff')) {
    roles.add('customer');
  }

  return Array.from(roles);
}

function getPrimaryRole(user) {
  if (!user || typeof user !== 'object') {
    return '';
  }

  const explicitPrimaryRole = normalizeRole(user.primaryRole);
  if (explicitPrimaryRole) {
    return explicitPrimaryRole;
  }

  const roles = getUserRoles(user);
  return ['system_admin', 'owner', 'staff', 'customer'].find((role) => roles.includes(role)) ||
    normalizeRole(user.role) ||
    roles[0] ||
    '';
}

function hasUserRole(user, role) {
  const normalizedRole = normalizeRole(role);
  return !!normalizedRole && getUserRoles(user).includes(normalizedRole);
}

function hasPermission(user, permission) {
  const normalizedPermission = normalizePermission(permission);
  if (!normalizedPermission) {
    return false;
  }

  if (hasUserRole(user, 'system_admin')) {
    return true;
  }

  const permissions = Array.isArray(user && user.permissions)
    ? user.permissions.map(normalizePermission)
    : [];
  return permissions.includes('*') || permissions.includes(normalizedPermission);
}

function syncGlobalAuthSession(session) {
  try {
    const app = runtimeApp || (typeof getApp === 'function' ? getApp() : null);
    if (app && app.globalData) {
      app.globalData.authSession = session || null;
    }
  } catch (_error) {
    // App may not be initialized yet while restoring storage at startup.
  }
}

function normalizeResponsePayload(payload) {
  if (!payload) {
    return {};
  }

  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch (_error) {
      return {};
    }
  }

  return payload;
}

function createAuthError(payload, fallbackMessage, extra = {}) {
  const normalizedPayload = normalizeResponsePayload(payload);
  const error = new Error(
    normalizedPayload.message || normalizedPayload.error || fallbackMessage || '微信登录失败'
  );
  error.code = normalizedPayload.code || extra.code || '';
  error.statusCode = extra.statusCode;
  error.payload = normalizedPayload;
  error.isUnauthorized = extra.statusCode === 401 || extra.statusCode === 403;
  error.isNetworkError = !!extra.isNetworkError;
  return error;
}

function mergeUserIdentity(currentUser, nextUser) {
  const current = currentUser && typeof currentUser === 'object' ? currentUser : {};
  const next = nextUser && typeof nextUser === 'object' ? nextUser : {};
  const hasAccessIdentity = ['primaryRole', 'roles', 'role'].some((key) => (
    Object.prototype.hasOwnProperty.call(next, key)
  ));
  const base = { ...current };

  // A /me response is authoritative. Do not retain stale access fields from
  // the cached login response when the server returns a fresh identity.
  if (hasAccessIdentity) {
    delete base.primaryRole;
    delete base.roles;
    delete base.role;
    delete base.permissions;
    delete base.staffRole;
    delete base.systemRole;
  }

  return {
    ...base,
    ...next
  };
}

function getStoredAuthSession() {
  const stored = wx.getStorageSync(STORAGE_KEY);
  if (!stored || typeof stored !== 'object') {
    return null;
  }

  if (!stored.token || !stored.expiresAt) {
    return null;
  }

  const expiresAtTime = new Date(stored.expiresAt).getTime();
  if (!Number.isFinite(expiresAtTime) || expiresAtTime <= Date.now()) {
    wx.removeStorageSync(STORAGE_KEY);
    syncGlobalAuthSession(null);
    return null;
  }

  return stored;
}

function setStoredAuthSession(session) {
  wx.setStorageSync(STORAGE_KEY, session);
  syncGlobalAuthSession(session);
  return session;
}

function clearAuthSession() {
  wx.removeStorageSync(STORAGE_KEY);
  syncGlobalAuthSession(null);
}

function isWechatAuthEnabled() {
  const app = runtimeApp || (typeof getApp === 'function' ? getApp() : null);
  return !!(app && app.globalData && app.globalData.enableWechatAuth);
}

function getAppContext() {
  const app = runtimeApp || (typeof getApp === 'function' ? getApp() : null);
  if (!app || !app.globalData) {
    const error = new Error('小程序正在初始化，请稍后重试');
    error.code = 'APP_NOT_READY';
    error.isNetworkError = true;
    throw error;
  }
  return app;
}

function getSessionToken() {
  const session = getStoredAuthSession();
  return session ? session.token : '';
}

function getCurrentUser() {
  const session = getStoredAuthSession();
  return session && session.user ? session.user : null;
}

function updateCurrentUser(user) {
  const session = getStoredAuthSession();
  if (!session || !user || typeof user !== 'object') {
    return session;
  }

  return setStoredAuthSession({
    ...session,
    user: mergeUserIdentity(session.user, user)
  });
}

function mergeSessionResponse(session, payload) {
  const response = normalizeResponsePayload(payload);
  const nextSession = {
    ...session
  };

  if (response.token) {
    nextSession.token = response.token;
  }
  if (response.expiresAt) {
    nextSession.expiresAt = response.expiresAt;
  }
  if (response.user && typeof response.user === 'object') {
    nextSession.user = mergeUserIdentity(session && session.user, response.user);
  }

  return setStoredAuthSession(nextSession);
}

function loginWithWxCode(phoneCode = '') {
  if (activeLoginPromise) {
    if (phoneCode) {
      return activeLoginPromise
        .catch(() => undefined)
        .then(() => loginWithWxCode(phoneCode));
    }
    return activeLoginPromise;
  }

  const app = getAppContext();
  console.log('[miniapp] wx.login start', {
    apiBaseUrl: app && app.globalData && app.globalData.apiBaseUrl
  });
  const loginPromise = new Promise((resolve, reject) => {
    wx.login({
      success: (loginResult) => {
        if (!loginResult.code) {
          reject(createAuthError({}, '未获取到微信登录凭证', {
            code: 'WECHAT_LOGIN_CODE_MISSING'
          }));
          return;
        }

        wx.request({
          url: `${app.globalData.apiBaseUrl}/api/v1/auth/wechat-login`,
          method: 'POST',
          timeout: AUTH_REQUEST_TIMEOUT_MS,
          data: {
            code: loginResult.code,
            ...(phoneCode ? { phoneCode } : {})
          },
          header: {
            'content-type': 'application/json'
          },
          success: (res) => {
            console.log('[miniapp] wechat-login response', {
              statusCode: res.statusCode,
              hasToken: !!(res.data && res.data.token),
              code: res.data && res.data.code
            });
            if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.token) {
              resolve(setStoredAuthSession(res.data));
              return;
            }

            reject(createAuthError(res.data, '微信登录失败', {
              statusCode: res.statusCode
            }));
          },
          fail: (error) => {
            console.error('[miniapp] wechat-login request failed', error);
            reject(createAuthError(error, '网络异常，微信登录失败', {
              code: 'NETWORK_ERROR',
              isNetworkError: true
            }));
          }
        });
      },
      fail: (error) => {
        console.error('[miniapp] wx.login failed', error);
        reject(createAuthError(error, '微信登录失败', {
          code: 'WECHAT_LOGIN_FAILED'
        }));
      }
    });
  });

  activeLoginPromise = loginPromise.then(
    (session) => {
      activeLoginPromise = null;
      return session;
    },
    (error) => {
      activeLoginPromise = null;
      if (`${error && error.code || ''}`.toUpperCase() === 'ACCOUNT_DISABLED') {
        clearAuthSession();
      }
      return Promise.reject(error);
    }
  );
  return activeLoginPromise;
}

function loginWithPhoneCode(phoneCode) {
  const normalizedPhoneCode = `${phoneCode || ''}`.trim();
  if (!normalizedPhoneCode) {
    const error = createAuthError({}, '未获取到手机号授权凭证', {
      code: 'WECHAT_PHONE_CODE_MISSING'
    });
    return Promise.reject(error);
  }
  return loginWithWxCode(normalizedPhoneCode);
}

function validateAuthSession(session) {
  const app = getAppContext();

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.apiBaseUrl}/api/v1/auth/me`,
      method: 'GET',
      timeout: AUTH_REQUEST_TIMEOUT_MS,
      header: {
        Authorization: `Bearer ${session.token}`
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.user) {
          resolve(mergeSessionResponse(session, res.data));
          return;
        }

        reject(createAuthError(res.data, '登录状态校验失败', {
          statusCode: res.statusCode
        }));
      },
      fail: (error) => {
        reject(createAuthError(error, '网络异常，登录状态校验失败', {
          code: 'NETWORK_ERROR',
          isNetworkError: true
        }));
      }
    });
  });
}

function restoreAuthSession(options = {}) {
  const { validate = false } = options;
  const stored = getStoredAuthSession();
  if (!stored) {
    return Promise.resolve(null);
  }

  if (!validate) {
    return Promise.resolve(stored);
  }

  return validateAuthSession(stored).catch((error) => {
    if (error && error.statusCode === 401) {
      clearAuthSession();
      return null;
    }
    return Promise.reject(error);
  });
}

function ensureAuthSession(options = {}) {
  const { force = false, validate = false } = options;

  if (force) {
    clearAuthSession();
  }

  const stored = force ? null : getStoredAuthSession();
  if (stored) {
    if (!validate) {
      return Promise.resolve(stored);
    }

    return validateAuthSession(stored).catch((error) => {
      const code = `${error && error.code || ''}`.toUpperCase();
      if (code === 'ACCOUNT_DISABLED') {
        clearAuthSession();
        return Promise.reject(error);
      }

      if (error && error.statusCode === 401) {
        clearAuthSession();
        return loginWithWxCode();
      }

      return Promise.reject(error);
    });
  }

  return loginWithWxCode();
}

function logoutAuthSession() {
  const app = getAppContext();
  const token = getSessionToken();

  if (!token) {
    clearAuthSession();
    return Promise.resolve({ ok: true });
  }

  return new Promise((resolve) => {
    wx.request({
      url: `${app.globalData.apiBaseUrl}/api/v1/auth/logout`,
      method: 'POST',
      timeout: AUTH_REQUEST_TIMEOUT_MS,
      header: {
        Authorization: `Bearer ${token}`
      },
      complete: () => {
        clearAuthSession();
        resolve({ ok: true });
      }
    });
  });
}

module.exports = {
  STORAGE_KEY,
  setAppContext,
  getAppContext,
  normalizeRole,
  getUserRoles,
  getPrimaryRole,
  hasUserRole,
  hasPermission,
  isWechatAuthEnabled,
  getStoredAuthSession,
  restoreAuthSession,
  getSessionToken,
  getCurrentUser,
  updateCurrentUser,
  validateAuthSession,
  ensureAuthSession,
  loginWithPhoneCode,
  logoutAuthSession,
  clearAuthSession
};
