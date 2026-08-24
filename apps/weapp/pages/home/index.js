const { listGallery } = require('../../services/appointment');
const { normalizeGalleryItems } = require('../../utils/gallery');

Page({
  data: {
    galleryItems: [],
    loading: true,
    hasError: false
  },

  onLoad(options = {}) {
    this.initializeLaunch(options);
  },

  async initializeLaunch(options = {}) {
    const app = getApp();
    try {
      const launch = app.ensureLaunchReady
        ? await app.ensureLaunchReady(options)
        : { target: '/pages/home/index' };
      const targetPath = `${launch.target || ''}`.split('?')[0];
      if (targetPath && targetPath !== '/pages/home/index') {
        wx.reLaunch({ url: launch.target });
        return;
      }
      await this.loadData();
    } catch (_error) {
      this.setData({
        loading: false,
        hasError: true
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
        hasError: true
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
