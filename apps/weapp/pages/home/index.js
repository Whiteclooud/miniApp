const { listGallery } = require('../../services/appointment');
const { normalizeGalleryItems } = require('../../utils/gallery');
const { promptForLogin } = require('../../utils/login-guard');

Page({
  data: {
    galleryItems: [],
    loading: true,
    hasError: false,
    errorMessage: ''
  },

  onLoad() {
    this.initializeLaunch();
  },

  onShow() {
    this.syncTabBar();
  },

  syncTabBar() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && typeof tabBar.syncSelected === 'function') {
      tabBar.syncSelected();
    }
  },

  async initializeLaunch() {
    const app = getApp();
    if (app.ensureLaunchReady) {
      // A cached-session refresh is useful, but public content must render
      // immediately even when the network is slow or unavailable.
      app.ensureLaunchReady().catch((error) => {
        console.warn('[miniapp] launch session restore failed', error && error.code);
      });
    }
    await this.loadData();
  },

  async onPullDownRefresh() {
    await this.loadData();
    wx.stopPullDownRefresh();
  },

  async loadData() {
    this.setData({ loading: true, hasError: false, errorMessage: '' });
    try {
      const res = await listGallery({ limit: 1 });
      this.setData({
        galleryItems: normalizeGalleryItems(res.items || []).slice(0, 1),
        loading: false
      });
    } catch (_error) {
      this.setData({
        galleryItems: [],
        loading: false,
        hasError: true,
        errorMessage: '返图加载失败，请检查网络后重试。'
      });
    }
  },

  goGalleryDetail(event) {
    const { id } = event.currentTarget.dataset;
    if (id) {
      wx.navigateTo({ url: `/pages/gallery-detail/index?id=${encodeURIComponent(id)}` });
    }
  },

  goGalleryList() {
    wx.navigateTo({ url: '/pages/gallery-list/index' });
  },

  viewAvailability() {
    wx.navigateTo({ url: '/pages/booking/index' });
  },

  goBooking() {
    promptForLogin({
      redirect: '/pages/booking/index',
      content: '提交预约需要使用微信登录。'
    });
  },

  goMyBookings() {
    promptForLogin({
      redirect: '/pages/my-bookings/index',
      content: '查看我的预约需要使用微信登录。'
    });
  }
});
