const { getCustomerIdentityOrThrow } = require('./customer');
const { getStaffIdentityOrThrow } = require('./staff');
const {
  getSessionToken,
  clearAuthSession,
  getAppContext
} = require('./auth');

const REQUEST_TIMEOUT_MS = 15000;

function createRequestError(message, extra = {}) {
  const error = new Error(message || '请求失败');
  Object.keys(extra).forEach((key) => {
    error[key] = extra[key];
  });
  return error;
}

function buildErrorMessage(payload, fallback) {
  if (typeof payload === 'string') {
    return payload || fallback || '请求失败';
  }

  const baseMessage = payload.error || payload.message || fallback || '请求失败';
  const missingText = Array.isArray(payload.missing) && payload.missing.length
    ? `：${payload.missing.join('、')}`
    : '';
  return `${baseMessage}${missingText}`;
}

function getErrorMessage(error, fallback) {
  return error && error.message ? error.message : fallback || '请求失败';
}

function getErrorKind(error) {
  if (!error) {
    return 'unknown';
  }

  if (error.isNetworkError || error.code === 'NETWORK_ERROR') {
    return 'network';
  }

  if (error.isUnauthorized || error.statusCode === 401 || error.statusCode === 403) {
    return 'unauthorized';
  }

  if (error.isConflict || error.statusCode === 409) {
    return 'conflict';
  }

  if (error.statusCode === 400) {
    return 'bad-request';
  }

  return 'unknown';
}

function buildAuthHeader(auth) {
  const sessionToken = getSessionToken();

  if (sessionToken) {
    return {
      Authorization: `Bearer ${sessionToken}`
    };
  }

  if (!isHeaderAuthFallbackEnabled()) {
    return {};
  }

  if (auth === 'customer') {
    const identity = getCustomerIdentityOrThrow();
    return {
      'X-Customer-OpenId': identity.openId
    };
  }

  if (auth === 'staff') {
    const identity = getStaffIdentityOrThrow();
    return {
      'X-Staff-OpenId': identity.openId
    };
  }

  return {};
}

function shouldUseWechatAuth(auth) {
  return auth === 'customer' || auth === 'staff';
}

function isHeaderAuthFallbackEnabled() {
  const app = getAppContextSafe();
  return !!(app && app.globalData && app.globalData.allowHeaderAuthFallback);
}

function getAppContextSafe() {
  try {
    return getAppContext();
  } catch (_error) {
    return null;
  }
}

function buildUrl(baseUrl, path, params) {
  if (!params || !Object.keys(params).length) {
    return `${baseUrl}${path}`;
  }

  const query = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  if (!query) {
    return `${baseUrl}${path}`;
  }

  return `${baseUrl}${path}${path.indexOf('?') >= 0 ? '&' : '?'}${query}`;
}

function isUnauthorizedResponse(statusCode, payload) {
  if (statusCode === 401 || statusCode === 403) {
    return true;
  }

  const code = `${(payload && (payload.code || payload.error)) || ''}`.toUpperCase();
  return code === 'STAFF_UNAUTHORIZED' || code === 'CUSTOMER_UNAUTHORIZED';
}

// A 401 received after sending a Bearer token means the cached session is no
// longer usable. Header-auth development requests must keep their local mock
// identity, so only clear storage when the effective request header carries a
// session token.
function getBearerSessionToken(statusCode, requestHeader, payload) {
  if (statusCode !== 401 || !requestHeader) {
    return '';
  }

  const code = `${payload && payload.code || ''}`.toUpperCase();
  if (code && code !== 'SESSION_UNAUTHORIZED' && code !== 'ACCOUNT_DISABLED') {
    return '';
  }

  const authorization = requestHeader.Authorization || requestHeader.authorization;
  const match = typeof authorization === 'string' && authorization.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : '';
}

function clearBearerSessionIfCurrent(statusCode, requestHeader, payload) {
  const requestToken = getBearerSessionToken(statusCode, requestHeader, payload);
  if (requestToken && getSessionToken() === requestToken) {
    clearAuthSession();
  }
  return requestToken;
}

function normalizeSuccessPayload(responseData) {
  if (!responseData) {
    return {};
  }

  if (typeof responseData === 'string') {
    try {
      return JSON.parse(responseData);
    } catch (_error) {
      return {};
    }
  }

  return responseData;
}

function createLoginRequiredError() {
  return createRequestError('请先登录后再继续。', {
    code: 'LOGIN_REQUIRED',
    isUnauthorized: true,
    isLoginRequired: true,
    statusCode: 401
  });
}

function requiresExplicitLogin(auth) {
  return shouldUseWechatAuth(auth) && !getSessionToken() && !isHeaderAuthFallbackEnabled();
}

function normalizeUnauthorizedError(error) {
  if (!error || !error.usedBearerSession || error.statusCode !== 401) {
    return error;
  }

  error.originalCode = error.code;
  error.code = 'LOGIN_REQUIRED';
  error.isLoginRequired = true;
  error.message = '登录状态已失效，请重新登录。';
  return error;
}

function request({ url, method = 'GET', data, header = {}, auth = 'none', params }) {
  const app = getAppContextSafe();
  if (!app || !app.globalData || !app.globalData.apiBaseUrl) {
    return Promise.reject(createRequestError('小程序正在初始化，请稍后重试。', {
      code: 'APP_NOT_READY',
      isNetworkError: true
    }));
  }

  if (requiresExplicitLogin(auth)) {
    return Promise.reject(createLoginRequiredError());
  }

  const runRequest = () => new Promise((resolve, reject) => {
    const authHeader = buildAuthHeader(auth);
    const requestHeader = {
      'content-type': 'application/json',
      ...authHeader,
      ...header
    };

    wx.request({
      url: buildUrl(app.globalData.apiBaseUrl, url, params),
      method,
      data,
      timeout: REQUEST_TIMEOUT_MS,
      header: requestHeader,
      success: (res) => {
        console.log('[miniapp] request response', {
          url,
          statusCode: res.statusCode,
          auth: auth || 'none'
        });
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data || {});
          return;
        }

        const payload = normalizeSuccessPayload(res.data);
        const bearerSessionToken = clearBearerSessionIfCurrent(res.statusCode, requestHeader, payload);

        reject(
          createRequestError(buildErrorMessage(payload, '请求失败'), {
            statusCode: res.statusCode,
            code: payload.code,
            payload,
            usedBearerSession: !!bearerSessionToken,
            sessionToken: bearerSessionToken,
            isUnauthorized: isUnauthorizedResponse(res.statusCode, payload),
            isConflict: res.statusCode === 409
          })
        );
      },
      fail: (error) => {
        console.error('[miniapp] request failed', {
          url,
          auth: auth || 'none',
          error
        });
        reject(
          createRequestError('网络异常，请确认本地服务是否已启动且已允许开发者工具访问。', {
            code: 'NETWORK_ERROR',
            payload: error,
            isNetworkError: true
          })
        );
      }
    });
  });

  return runRequest().catch((error) => Promise.reject(normalizeUnauthorizedError(error)));
}

function uploadFiles({ url, filePaths = [], name = 'files', formData = {}, header = {}, auth = 'none' }) {
  const app = getAppContextSafe();
  if (!app || !app.globalData || !app.globalData.apiBaseUrl) {
    return Promise.reject(createRequestError('小程序正在初始化，请稍后重试。', {
      code: 'APP_NOT_READY',
      isNetworkError: true
    }));
  }
  if (requiresExplicitLogin(auth)) {
    return Promise.reject(createLoginRequiredError());
  }
  const targets = (filePaths || []).filter((item) => typeof item === 'string' && item.trim());

  if (!targets.length) {
    return Promise.resolve({ items: [] });
  }

  const uploadOneRequest = (filePath) => new Promise((resolve, reject) => {
    const authHeader = buildAuthHeader(auth);
    const requestHeader = {
      ...authHeader,
      ...header
    };

    wx.uploadFile({
      url: buildUrl(app.globalData.apiBaseUrl, url),
      filePath,
      name,
      formData,
      timeout: REQUEST_TIMEOUT_MS,
      header: requestHeader,
      success: (res) => {
        const payload = normalizeSuccessPayload(res.data);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(payload || {});
          return;
        }

        const bearerSessionToken = clearBearerSessionIfCurrent(res.statusCode, requestHeader, payload);

        reject(
          createRequestError(buildErrorMessage(payload, '上传失败'), {
            statusCode: res.statusCode,
            code: payload.code,
            payload,
            usedBearerSession: !!bearerSessionToken,
            sessionToken: bearerSessionToken,
            isUnauthorized: isUnauthorizedResponse(res.statusCode, payload),
            isConflict: res.statusCode === 409
          })
        );
      },
      fail: (error) => {
        reject(
          createRequestError('网络异常，图片上传失败。请确认本地服务已启动且已允许开发者工具访问。', {
            code: 'NETWORK_ERROR',
            payload: error,
            isNetworkError: true
          })
        );
      }
    });
  });

  const uploadOne = (filePath) => uploadOneRequest(filePath)
    .catch((error) => Promise.reject(normalizeUnauthorizedError(error)));

  const runUploads = () => targets.reduce((chain, filePath) => chain.then(async (acc) => {
    const payload = await uploadOne(filePath);
    return {
      ...payload,
      items: [...(acc.items || []), ...((payload && payload.items) || [])]
    };
  }), Promise.resolve({ items: [] }));

  return runUploads();
}

module.exports = {
  request,
  uploadFiles,
  createRequestError,
  createLoginRequiredError,
  getErrorKind,
  getErrorMessage,
  clearAuthSession
};
