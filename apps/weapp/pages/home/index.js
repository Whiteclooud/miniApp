const { listGallery } = require('../../services/appointment');

Page({
  data: {
    galleryItems: [],
    loading: true,
    hasError: false
  },

  onLoad() {
    this.loadData();
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
        galleryItems: res.items || [],
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
