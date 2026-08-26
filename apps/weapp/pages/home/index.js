const { listGallery } = require('../../services/appointment');
const { normalizeGalleryItems } = require('../../utils/gallery');
const { hasUserRole } = require('../../utils/auth');

const LAUNCH_TIMEOUT_MS = 15000;

function withLaunchTimeout(promise) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('微信登录或服务器连接超时');
      error.code = 'LAUNCH_TIMEOUT';
      error.isNetworkError = true;
      reject(error);
    }, LAUNCH_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

Page({
  data: {
    galleryItems: [],
    loading: true,
    hasError: false,
    showStaffEntry: false,
    errorMessage: '',
    showAuthCard: false,
    isLoggedIn: false,
    phoneBound: false,
    agreementChecked: false,
    phoneLoginLoading: false,
    authMessage: ''
  },

  onLoad(options = {}) {
    this.initializeLaunch(options);
  },

  onShow() {
    this.syncAuthState();
  },

  syncAuthState(session) {
    const app = getApp();
    const authSession = session || (app.globalData && app.globalData.authSession);
    const user = authSession && authSession.user;
    this.setData({
      showAuthCard: !!(app.globalData && app.globalData.enableWechatAuth),
      isLoggedIn: !!(authSession && authSession.token),
      phoneBound: !!(user && user.phone),
      showStaffEntry: !!(
        hasUserRole(user, 'staff') ||
        (app.globalData && app.globalData.allowHeaderAuthFallback)
      )
    });
  },

  async initializeLaunch(options = {}) {
    const app = getApp();
    try {
      const launch = app.ensureLaunchReady
        ? await withLaunchTimeout(app.ensureLaunchReady(options))
        : { target: '/pages/home/index' };
      const user = launch.session && launch.session.user;
      this.syncAuthState(launch.session);
      const targetPath = `${launch.target || ''}`.split('?')[0];
      if (targetPath && targetPath !== '/pages/home/index') {
        wx.reLaunch({ url: launch.target });
        return;
      }
      await this.loadData();
    } catch (_error) {
      this.setData({
        loading: false,
        hasError: true,
        showStaffEntry: false,
        showAuthCard: !!(app.globalData && app.globalData.enableWechatAuth),
        isLoggedIn: false,
        phoneBound: false,
        authMessage: _error && _error.code === 'ACCOUNT_DISABLED'
          ? '当前账号已停用，请联系店员处理。'
          : '登录失败，请点击下方按钮重试。',
        errorMessage: _error && _error.code === 'LAUNCH_TIMEOUT'
          ? '微信登录或服务器连接超时，请检查正式小程序服务器域名配置。'
          : '登录失败，请重新打开小程序后重试。'
      });
    }
  },

  onAgreementChange(event) {
    const values = event.detail && event.detail.value;
    this.setData({ agreementChecked: Array.isArray(values) && values.includes('service') });
  },

  async handlePhoneLogin(event) {
    if (!this.data.agreementChecked) {
      wx.showToast({ title: '请先同意服务协议', icon: 'none' });
      return;
    }

    const detail = event.detail || {};
    const phoneCode = `${detail.code || ''}`.trim();
    if (detail.errMsg !== 'getPhoneNumber:ok' || !phoneCode) {
      this.setData({ authMessage: '未完成手机号授权，你仍可使用微信登录。' });
      return;
    }

    const app = getApp();
    this.setData({ phoneLoginLoading: true, authMessage: '' });
    try {
      const session = await app.loginWithPhoneCode(phoneCode);
      this.syncAuthState(session);
      wx.showToast({ title: '手机号授权成功', icon: 'success' });
      if (hasUserRole(session && session.user, 'staff')) {
        wx.reLaunch({ url: '/pages/staff/appointments/index' });
      } else if (this.data.hasError) {
        this.setData({ hasError: false });
        await this.loadData();
      }
    } catch (error) {
      this.setData({ authMessage: formatAuthError(error) });
      wx.showToast({ title: '手机号授权失败', icon: 'none' });
    } finally {
      this.setData({ phoneLoginLoading: false });
    }
  },

  async loginWithoutPhone() {
    const app = getApp();
    this.setData({ phoneLoginLoading: true, authMessage: '' });
    try {
      const session = await app.ensureAuthSession({ force: true });
      this.syncAuthState(session);
      const target = hasUserRole(session && session.user, 'staff')
        ? '/pages/staff/appointments/index'
        : '/pages/home/index';
      if (target !== '/pages/home/index') {
        wx.reLaunch({ url: target });
      } else if (this.data.hasError) {
        this.setData({ hasError: false });
        await this.loadData();
      }
    } catch (error) {
      this.setData({ authMessage: formatAuthError(error) });
    } finally {
      this.setData({ phoneLoginLoading: false });
    }
  },

  async retryLaunch() {
    await this.loginWithoutPhone();
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后仍可浏览公开内容，预约和灵感需要重新登录。',
      confirmText: '退出',
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        const app = getApp();
        await app.logoutAuthSession();
        this.syncAuthState(null);
        this.setData({ agreementChecked: false, authMessage: '已退出登录。' });
      }
    });
  },

  async onPullDownRefresh() {
    await this.loadData();
    wx.stopPullDownRefresh();
  },

  async loadData() {
    this.setData({ loading: true, hasError: false });
    try {
      const res = await listGallery({ limit: 1 });
      this.setData({
        galleryItems: normalizeGalleryItems(res.items || []).slice(0, 1),
        loading: false,
        hasError: false
      });
    } catch (_error) {
      this.setData({
        galleryItems: [],
        loading: false,
        hasError: true,
        errorMessage: '返图加载失败，请检查网络和服务器域名配置。'
      });
      wx.showToast({
        title: '首页加载失败',
        icon: 'none'
      });
    }
  },

  goGalleryDetail(event) {
    const { id } = event.currentTarget.dataset;
    if (!id) {
      return;
    }
    wx.navigateTo({
      url: `/pages/gallery-detail/index?id=${encodeURIComponent(id)}`
    });
  },

  goGalleryList() {
    wx.navigateTo({
      url: '/pages/gallery-list/index'
    });
  },

  goBooking() {
    wx.navigateTo({
      url: '/pages/booking/index'
    });
  },

  goMyBookings() {
    wx.navigateTo({
      url: '/pages/my-bookings/index'
    });
  },

  goMyInspirations() {
    wx.navigateTo({
      url: '/pages/my-inspirations/index'
    });
  },

  goStaffRules() {
    wx.navigateTo({
      url: '/pages/staff/appointments/index'
    });
  }
});

function formatAuthError(error) {
  const code = `${error && error.code || ''}`.toUpperCase();
  if (code === 'WECHAT_PHONE_AUTH_FAILED') {
    return '微信手机号授权未完成，请稍后重试。';
  }
  if (error && error.isNetworkError) {
    return '网络异常，请确认小程序已配置 HTTPS 合法域名。';
  }
  return error && error.message ? error.message : '登录失败，请稍后重试。';
}
