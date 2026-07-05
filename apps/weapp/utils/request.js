const { getCustomerIdentityOrThrow } = require('./customer');
const { getStaffIdentityOrThrow } = require('./staff');
const {
  ensureAuthSession,
  getSessionToken,
  clearAuthSession,
  isWechatAuthEnabled
} = require('./auth');

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
  const app = getApp();
  return !!(app && app.globalData && app.globalData.allowHeaderAuthFallback);
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

function isSessionUnauthorized(statusCode, payload) {
  if (statusCode !== 401) {
    return false;
  }

  const code = `${(payload && (payload.code || payload.error)) || ''}`.toUpperCase();
  return code === 'SESSION_UNAUTHORIZED';
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

function request({ url, method = 'GET', data, header = {}, auth = 'none', params }) {
  const app = getApp();

  const runRequest = () => new Promise((resolve, reject) => {
    const authHeader = buildAuthHeader(auth);

    wx.request({
      url: buildUrl(app.globalData.apiBaseUrl, url, params),
      method,
      data,
      header: {
        'content-type': 'application/json',
        ...authHeader,
        ...header
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data || {});
          return;
        }

        const payload = normalizeSuccessPayload(res.data);
        if (isSessionUnauthorized(res.statusCode, payload)) {
          clearAuthSession();
        }

        reject(
          createRequestError(buildErrorMessage(payload, '请求失败'), {
            statusCode: res.statusCode,
            code: payload.code,
            payload,
            isUnauthorized: isUnauthorizedResponse(res.statusCode, payload),
            isConflict: res.statusCode === 409
          })
        );
      },
      fail: (error) => {
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

  if (!shouldUseWechatAuth(auth) || getSessionToken() || !isWechatAuthEnabled()) {
    return runRequest();
  }

  return ensureAuthSession()
    .then(() => runRequest())
    .catch((error) => {
      if (isHeaderAuthFallbackEnabled()) {
        return runRequest();
      }

      return Promise.reject(error);
    });
}

function uploadFiles({ url, filePaths = [], name = 'files', formData = {}, header = {}, auth = 'none' }) {
  const app = getApp();
  const targets = (filePaths || []).filter((item) => typeof item === 'string' && item.trim());

  if (!targets.length) {
    return Promise.resolve({ items: [] });
  }

  const uploadOne = (filePath) => new Promise((resolve, reject) => {
    const authHeader = buildAuthHeader(auth);

    wx.uploadFile({
      url: buildUrl(app.globalData.apiBaseUrl, url),
      filePath,
      name,
      formData,
      header: {
        ...authHeader,
        ...header
      },
      success: (res) => {
        const payload = normalizeSuccessPayload(res.data);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(payload || {});
          return;
        }

        if (isSessionUnauthorized(res.statusCode, payload)) {
          clearAuthSession();
        }

        reject(
          createRequestError(buildErrorMessage(payload, '上传失败'), {
            statusCode: res.statusCode,
            code: payload.code,
            payload,
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

  const runUploads = () => targets.reduce((chain, filePath) => chain.then(async (acc) => {
    const payload = await uploadOne(filePath);
    return {
      ...payload,
      items: [...(acc.items || []), ...((payload && payload.items) || [])]
    };
  }), Promise.resolve({ items: [] }));

  if (!shouldUseWechatAuth(auth) || getSessionToken() || !isWechatAuthEnabled()) {
    return runUploads();
  }

  return ensureAuthSession()
    .then(() => runUploads())
    .catch((error) => {
      if (isHeaderAuthFallbackEnabled()) {
        return runUploads();
      }

      return Promise.reject(error);
    });
}

module.exports = {
  request,
  uploadFiles,
  createRequestError,
  getErrorKind,
  getErrorMessage,
  clearAuthSession
};
