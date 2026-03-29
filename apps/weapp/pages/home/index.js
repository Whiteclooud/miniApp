const { listGallery } = require('../../services/appointment');
const { normalizeGalleryItems } = require('../../utils/gallery');

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
      const res = await listGallery({ limit: 3 });
      this.setData({
        galleryItems: normalizeGalleryItems(res.items || []),
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

  goStaffRules() {
    wx.navigateTo({
      url: '/pages/staff/rules/index'
    });
  }
});
