const { listGallery } = require('../../services/appointment');
const { normalizeGalleryItems } = require('../../utils/gallery');

Page({
  data: {
    pageState: 'loading',
    stateMessage: '',
    galleryItems: []
  },

  onLoad() {
    this.loadData();
  },

  async onPullDownRefresh() {
    await this.loadData();
    wx.stopPullDownRefresh();
  },

  async loadData() {
    this.setData({
      pageState: 'loading',
      stateMessage: ''
    });

    try {
      const response = await listGallery();
      const galleryItems = normalizeGalleryItems(response.items || []);
      this.setData({
        galleryItems,
        pageState: galleryItems.length ? 'ready' : 'empty',
        stateMessage: galleryItems.length ? '' : '当前还没有已发布返图。'
      });
    } catch (_error) {
      this.setData({
        pageState: 'error',
        stateMessage: '返图列表加载失败，请稍后重试。',
        galleryItems: []
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
  }
});
