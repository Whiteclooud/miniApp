const { listGallery } = require('../../services/appointment');
const { normalizeGalleryItems } = require('../../utils/gallery');

function getApiProfileState() {
  const app = getApp();
  const apiProfile = app.getApiProfile();

  return {
    apiProfileLabel: apiProfile.label,
    apiProfileBaseUrl: apiProfile.baseUrl,
    apiProfileKey: apiProfile.key,
    canSwitchApiProfile: apiProfile.canSwitch,
    isDevelopEnv: apiProfile.isDevelopEnv
  };
}

Page({
  data: {
    galleryItems: [],
    loading: true,
    hasError: false,
    apiProfileLabel: '',
    apiProfileBaseUrl: '',
    apiProfileKey: 'api',
    canSwitchApiProfile: false,
    isDevelopEnv: false
  },

  onLoad() {
    this.syncApiProfileState();
    this.loadData();
  },

  onShow() {
    this.syncApiProfileState();
  },

  syncApiProfileState() {
    this.setData(getApiProfileState());
  },

  async onPullDownRefresh() {
    await this.loadData();
    wx.stopPullDownRefresh();
  },

  async loadData() {
    this.setData({ loading: true, hasError: false });
    try {
      const res = await listGallery();
      this.setData({
        galleryItems: normalizeGalleryItems(res.items || []),
        loading: false,
        hasError: false
      });
    } catch (error) {
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

  goStaffRules() {
    wx.navigateTo({
      url: '/pages/staff/rules/index'
    });
  }
});
