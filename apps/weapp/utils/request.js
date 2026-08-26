const { getCustomerIdentityOrThrow } = require('./customer');
const { getStaffIdentityOrThrow } = require('./staff');
const {
  ensureAuthSession,
  getSessionToken,
  clearAuthSession,
  isWechatAuthEnabled
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

// A 401 received after sending a Bearer token means the cached session is no
// longer usable. Header-auth development requests must keep their local mock
// identity, so only clear storage when the effective request header carries a
// session token.
function getBearerSessionToken(statusCode, requestHeader) {
  if (statusCode !== 401 || !requestHeader) {
    return '';
  }

  const authorization = requestHeader.Authorization || requestHeader.authorization;
  const match = typeof authorization === 'string' && authorization.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : '';
}

function clearBearerSessionIfCurrent(statusCode, requestHeader) {
  const requestToken = getBearerSessionToken(statusCode, requestHeader);
  if (requestToken && getSessionToken() === requestToken) {
    clearAuthSession();
  }
  return requestToken;
}

function shouldRefreshBearerSession(error, didRefresh) {
  return !didRefresh && !!(
    error &&
    error.usedBearerSession &&
    error.statusCode === 401 &&
    isWechatAuthEnabled()
  );
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
        const bearerSessionToken = clearBearerSessionIfCurrent(res.statusCode, requestHeader);

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

  const runWithSessionRefresh = (didRefresh = false) => runRequest().catch((error) => {
    if (!shouldRefreshBearerSession(error, didRefresh)) {
      return Promise.reject(error);
    }

    if (getSessionToken() && getSessionToken() !== error.sessionToken) {
      return runWithSessionRefresh(true);
    }

    return ensureAuthSession({ force: true })
      .then(() => runWithSessionRefresh(true));
  });

  if (!shouldUseWechatAuth(auth) || getSessionToken() || !isWechatAuthEnabled()) {
    return runWithSessionRefresh();
  }

  return ensureAuthSession()
    .then(() => runWithSessionRefresh())
    .catch((error) => {
      if (isHeaderAuthFallbackEnabled()) {
        return runWithSessionRefresh();
      }

      return Promise.reject(error);
    });
}

function uploadFiles({ url, filePaths = [], name = 'files', formData = {}, header = {}, auth = 'none' }) {
  const app = getApp();
  const targets = (filePaths || []).filter((item) => typeof item === 'string' && item.trim());
  let didRefreshSession = false;

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

        const bearerSessionToken = clearBearerSessionIfCurrent(res.statusCode, requestHeader);

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

  const uploadOne = (filePath) => uploadOneRequest(filePath).catch((error) => {
    if (!shouldRefreshBearerSession(error, didRefreshSession)) {
      return Promise.reject(error);
    }

    didRefreshSession = true;
    if (getSessionToken() && getSessionToken() !== error.sessionToken) {
      return uploadOneRequest(filePath);
    }

    return ensureAuthSession({ force: true })
      .then(() => uploadOneRequest(filePath));
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
