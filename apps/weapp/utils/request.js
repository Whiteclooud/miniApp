const app = getApp();

function request({ url, method = 'GET', data }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.apiBaseUrl}${url}`,
      method,
      data,
      header: {
        'content-type': 'application/json'
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

module.exports = { request };
