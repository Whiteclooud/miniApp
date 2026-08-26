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
    errorMessage: ''
  },

  onLoad(options = {}) {
    this.initializeLaunch(options);
  },

  async initializeLaunch(options = {}) {
    const app = getApp();
    try {
      const launch = app.ensureLaunchReady
        ? await withLaunchTimeout(app.ensureLaunchReady(options))
        : { target: '/pages/home/index' };
      const user = launch.session && launch.session.user;
      this.setData({
        showStaffEntry: !!(
          hasUserRole(user, 'staff') ||
          (app.globalData && app.globalData.allowHeaderAuthFallback)
        )
      });
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
        errorMessage: _error && _error.code === 'LAUNCH_TIMEOUT'
          ? '微信登录或服务器连接超时，请检查正式小程序服务器域名配置。'
          : '登录失败，请重新打开小程序后重试。'
      });
    }
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
