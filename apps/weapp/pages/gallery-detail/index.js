const { listGallery } = require('../../services/appointment');
const { normalizeGalleryItems } = require('../../utils/gallery');

Page({
  data: {
    pageState: 'loading',
    item: null,
    previewUrls: [],
    stateMessage: ''
  },

  onLoad(options = {}) {
    this.galleryId = decodeURIComponent(options.id || '');
    this.loadData();
  },

  async onPullDownRefresh() {
    await this.loadData();
    wx.stopPullDownRefresh();
  },

  async loadData() {
    if (!this.galleryId) {
      this.setData({
        pageState: 'error',
        stateMessage: '缺少返图标识，暂时无法查看详情。'
      });
      return;
    }

    this.setData({
      pageState: 'loading',
      stateMessage: ''
    });

    try {
      const res = await listGallery();
      const items = normalizeGalleryItems(res.items || []);
      const item = items.find((entry) => entry.id === this.galleryId);
      if (!item) {
        this.setData({
          pageState: 'empty',
          stateMessage: '当前返图详情不存在或已下线。'
        });
        return;
      }

      wx.setNavigationBarTitle({ title: item.title || '返图详情' });
      this.setData({
        pageState: 'ready',
        item,
        previewUrls: item.imageUrls || []
      });
    } catch (error) {
      this.setData({
        pageState: 'error',
        stateMessage: '返图详情加载失败，请稍后重试。'
      });
    }
  },

  previewImage(event) {
    const { url } = event.currentTarget.dataset;
    const { previewUrls } = this.data;
    if (!url || !previewUrls.length) {
      return;
    }

    wx.previewImage({
      current: url,
      urls: previewUrls
    });
  },

  goBooking() {
    wx.navigateTo({
      url: '/pages/booking/index'
    });
  }
});
