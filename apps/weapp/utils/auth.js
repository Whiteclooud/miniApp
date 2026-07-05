const STORAGE_KEY = 'miniapp.authSession';

function getStoredAuthSession() {
  const stored = wx.getStorageSync(STORAGE_KEY);
  if (!stored || typeof stored !== 'object') {
    return null;
  }

  if (!stored.token || !stored.expiresAt) {
    return null;
  }

  if (new Date(stored.expiresAt).getTime() <= Date.now()) {
    wx.removeStorageSync(STORAGE_KEY);
    return null;
  }

  return stored;
}

function setStoredAuthSession(session) {
  wx.setStorageSync(STORAGE_KEY, session);
  return session;
}

function clearAuthSession() {
  wx.removeStorageSync(STORAGE_KEY);
}

function isWechatAuthEnabled() {
  const app = getApp();
  return !!(app && app.globalData && app.globalData.enableWechatAuth);
}

function getSessionToken() {
  const session = getStoredAuthSession();
  return session ? session.token : '';
}

function getCurrentUser() {
  const session = getStoredAuthSession();
  return session && session.user ? session.user : null;
}

function loginWithWxCode() {
  const app = getApp();

  return new Promise((resolve, reject) => {
    wx.login({
      success: (loginResult) => {
        if (!loginResult.code) {
          reject(new Error('未获取到微信登录 code'));
          return;
        }

        wx.request({
          url: `${app.globalData.apiBaseUrl}/api/v1/auth/wechat-login`,
          method: 'POST',
          data: {
            code: loginResult.code
          },
          header: {
            'content-type': 'application/json'
          },
          success: (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.token) {
              resolve(setStoredAuthSession(res.data));
              return;
            }

            reject(new Error((res.data && (res.data.message || res.data.error)) || '微信登录失败'));
          },
          fail: () => {
            reject(new Error('网络异常，微信登录失败'));
          }
        });
      },
      fail: () => {
        reject(new Error('微信登录失败'));
      }
    });
  });
}

function ensureAuthSession(options = {}) {
  const { force = false } = options;
  const stored = force ? null : getStoredAuthSession();

  if (stored) {
    return Promise.resolve(stored);
  }

  return loginWithWxCode();
}

function logoutAuthSession() {
  const app = getApp();
  const token = getSessionToken();

  if (!token) {
    clearAuthSession();
    return Promise.resolve({ ok: true });
  }

  return new Promise((resolve) => {
    wx.request({
      url: `${app.globalData.apiBaseUrl}/api/v1/auth/logout`,
      method: 'POST',
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
  isWechatAuthEnabled,
  getStoredAuthSession,
  getSessionToken,
  getCurrentUser,
  ensureAuthSession,
  logoutAuthSession,
  clearAuthSession
};
