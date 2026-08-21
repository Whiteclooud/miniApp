const { listGallery } = require('../../services/appointment');
const { normalizeGalleryItems } = require('../../utils/gallery');

const GALLERY_FILTERS = [
  { label: '推荐', tag: '' },
  { label: '通勤', tag: '通勤' },
  { label: '约会', tag: '约会' },
  { label: '热门', tag: '热门' }
];

Page({
  data: {
    pageState: 'loading',
    stateMessage: '',
    filters: GALLERY_FILTERS,
    activeTag: '',
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
      const response = await listGallery(this.data.activeTag ? { tag: this.data.activeTag } : {});
      const galleryItems = normalizeGalleryItems(response.items || []);
      this.setData({
        galleryItems,
        pageState: galleryItems.length ? 'ready' : 'empty',
        stateMessage: galleryItems.length
          ? ''
          : this.data.activeTag
            ? `当前没有“${this.data.activeTag}”分类的已发布返图。`
            : '当前还没有已发布返图。'
      });
    } catch (_error) {
      this.setData({
        pageState: 'error',
        stateMessage: '返图列表加载失败，请稍后重试。',
        galleryItems: []
      });
    }
  },

  async onFilterTap(event) {
    const tag = event.currentTarget.dataset.tag || '';
    if (tag === this.data.activeTag) {
      return;
    }

    this.setData({ activeTag: tag });
    await this.loadData();
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
