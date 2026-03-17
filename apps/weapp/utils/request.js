const { getCustomerIdentityOrThrow } = require('./customer');
const { getStaffIdentityOrThrow } = require('./staff');

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

function request({ url, method = 'GET', data, header = {}, auth = 'none', params }) {
  const app = getApp();
  const authHeader = buildAuthHeader(auth);

  return new Promise((resolve, reject) => {
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

        const payload = res.data || {};
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
}

module.exports = {
  request,
  createRequestError,
  getErrorKind,
  getErrorMessage
};
