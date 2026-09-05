const auth = require('../../utils/auth');
const { finishLoginRedirect, normalizeRedirect } = require('../../utils/login-guard');

function decodeOption(value) {
  try {
    return decodeURIComponent(value || '');
  } catch (_error) {
    return `${value || ''}`;
  }
}

Page({
  data: {
    loading: false,
    message: '',
    redirect: '/pages/home/index'
  },

  onLoad(options = {}) {
    this.setData({ redirect: normalizeRedirect(decodeOption(options.redirect)) });
  },

  async login() {
    if (this.data.loading) {
      return;
    }

    const app = getApp();
    if (!app.globalData.enableWechatAuth && app.globalData.allowHeaderAuthFallback) {
      if (!app.getCustomerIdentity().canUse) {
        app.createMockCustomerOpenId();
      }
      wx.showToast({ title: '已使用开发环境模拟身份', icon: 'none' });
      finishLoginRedirect(this.data.redirect, auth.getCurrentUser());
      return;
    }

    this.setData({ loading: true, message: '' });
    try {
      const session = await app.ensureAuthSession({ force: true });
      wx.showToast({ title: '登录成功', icon: 'success' });
      finishLoginRedirect(this.data.redirect, session && session.user);
    } catch (error) {
      const code = `${error && error.code || ''}`.toUpperCase();
      this.setData({
        message: code === 'ACCOUNT_DISABLED'
          ? '当前账号已停用，请联系门店处理。'
          : error && error.isNetworkError
            ? '网络异常，请检查小程序网络配置后重试。'
            : '登录失败，请稍后重试。'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  cancel() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: '/pages/home/index' });
  }
});
