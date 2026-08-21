const { getGalleryDetail, createMyInspiration } = require('../../services/appointment');
const { normalizeGalleryItem } = require('../../utils/gallery');

Page({
  data: {
    pageState: 'loading',
    item: null,
    previewUrls: [],
    activeImageUrl: '',
    selectedImageIndex: 0,
    inspirationNote: '',
    inspirationState: 'idle',
    savedInspirationId: '',
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
      const res = await getGalleryDetail(this.galleryId);
      if (!res.item || !res.item.id) {
        throw new Error('Invalid gallery detail response');
      }

      const item = normalizeGalleryItem(res.item);

      const previewUrls = item.imageUrls || [];
      this.setData({
        pageState: 'ready',
        item,
        previewUrls,
        activeImageUrl: previewUrls[0] || '',
        selectedImageIndex: 0,
        inspirationNote: '',
        inspirationState: 'idle',
        savedInspirationId: ''
      });
    } catch (error) {
      if (error && (error.statusCode === 404 || error.code === 'GALLERY_ITEM_NOT_FOUND')) {
        this.setData({
          pageState: 'empty',
          stateMessage: '当前返图详情不存在或已下线。',
          item: null,
          previewUrls: [],
          activeImageUrl: ''
        });
        return;
      }

      this.setData({
        pageState: 'error',
        stateMessage: '返图详情加载失败，请稍后重试。',
        item: null,
        previewUrls: [],
        activeImageUrl: ''
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

  selectImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const { previewUrls } = this.data;
    if (!Number.isInteger(index) || index < 0 || index >= previewUrls.length) {
      return;
    }

    this.setData({
      selectedImageIndex: index,
      activeImageUrl: previewUrls[index]
    });
  },

  onInspirationNoteInput(event) {
    this.setData({ inspirationNote: event.detail.value });
  },

  async saveToInspirations() {
    const item = this.data.item || {};
    if (!item.id || this.data.inspirationState === 'saving' || this.data.inspirationState === 'saved') {
      return;
    }

    this.setData({ inspirationState: 'saving' });
    try {
      const response = await createMyInspiration({
        galleryItemId: item.id,
        note: this.data.inspirationNote || ''
      });
      this.setData({
        inspirationState: 'saved',
        savedInspirationId: response && response.item && response.item.id || ''
      });
      wx.showToast({ title: '已保存到我的灵感', icon: 'success' });
    } catch (error) {
      this.setData({ inspirationState: 'idle' });
      const message = error && error.code === 'GALLERY_ITEM_NOT_AVAILABLE'
        ? '这条返图已下线，暂时不能保存。'
        : error && error.isUnauthorized
          ? '请先完成顾客登录后再保存。'
          : '保存失败，请稍后重试。';
      wx.showToast({ title: message, icon: 'none' });
    }
  },

  goBooking() {
    const item = this.data.item || {};
    const title = item.title || '';
    const referenceImageUrl = this.data.activeImageUrl || item.imageUrl || '';
    const query = [
      `galleryId=${encodeURIComponent(item.id || '')}`,
      `galleryTitle=${encodeURIComponent(title)}`,
      `referenceImageUrl=${encodeURIComponent(referenceImageUrl)}`
    ].join('&');
    wx.navigateTo({
      url: `/pages/booking/index?${query}`
    });
  }
});
