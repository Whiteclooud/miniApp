const app = getApp();

const STAFF_OPEN_ID_STORAGE_KEY = 'staffOpenId';

function request({ url, method = 'GET', data, header = {} }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.apiBaseUrl}${url}`,
      method,
      data,
      header: {
        'content-type': 'application/json',
        ...header
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        reject(res.data || { error: 'Request failed' });
      },
      fail: reject
    });
  });
}

function getStaffHeaders() {
  const openId = wx.getStorageSync(STAFF_OPEN_ID_STORAGE_KEY);
  return openId
    ? {
        'X-Staff-OpenId': openId
      }
    : {};
}

function staffRequest(options) {
  return request({
    ...options,
    header: {
      ...getStaffHeaders(),
      ...(options.header || {})
    }
  });
}

module.exports = {
  request,
  staffRequest,
  getStaffHeaders,
  STAFF_OPEN_ID_STORAGE_KEY
};
