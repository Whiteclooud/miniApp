const {
  listMyInspirations,
  getMyInspiration,
  updateMyInspiration,
  deleteMyInspiration
} = require('../../services/appointment');
const { getErrorMessage } = require('../../utils/request');
const { DEFAULT_DEVELOP_CUSTOMER_OPENID } = require('../../utils/customer');
const { hasCustomerAccess, isLoginRequiredError, redirectToLogin } = require('../../utils/login-guard');

const PAGE_LIMIT = 20;

function formatDate(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return `${value}`;
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function normalizeItem(item = {}, index = 0) {
  const galleryItem = item.galleryItem && item.galleryItem.id
    ? item.galleryItem
    : null;
  const imageUrls = galleryItem && Array.isArray(galleryItem.imageUrls)
    ? galleryItem.imageUrls.filter((url) => typeof url === 'string' && url.trim())
    : [];
  const coverImageUrl = galleryItem
    ? galleryItem.imageUrl || imageUrls[0] || ''
    : '';

  return {
    id: item.id || `inspiration-${index}`,
    galleryItemId: item.galleryItemId || (galleryItem && galleryItem.id) || '',
    note: typeof item.note === 'string' ? item.note : '',
    availability: item.availability === 'available' && galleryItem ? 'available' : 'unavailable',
    createdAt: item.createdAt || '',
    updatedAt: item.updatedAt || '',
    createdAtText: formatDate(item.createdAt),
    updatedAtText: formatDate(item.updatedAt),
    galleryItem: galleryItem
      ? {
          ...galleryItem,
          imageUrl: coverImageUrl,
          imageUrls: imageUrls.length ? imageUrls : (coverImageUrl ? [coverImageUrl] : []),
          tags: Array.isArray(galleryItem.tags) ? galleryItem.tags.filter(Boolean) : [],
          publishedAtText: formatDate(galleryItem.publishedAt)
        }
      : null,
    coverImageUrl,
    title: galleryItem ? galleryItem.title || '未命名返图' : '返图已下线'
  };
}

function getIdentityMeta() {
  const app = getApp();
  const identity = app.getCustomerIdentity
    ? app.getCustomerIdentity()
    : app.globalData.customerIdentity;
  const isDefaultMock = !!(identity && (
    identity.isDefaultMock || identity.openId === DEFAULT_DEVELOP_CUSTOMER_OPENID
  ));
  const headerFallbackEnabled = !!(app.globalData && app.globalData.allowHeaderAuthFallback);
  const isDevelopEnv = !!app.globalData.isDevelopEnv && headerFallbackEnabled;

  return {
    openId: identity && identity.openId || '',
    label: identity && identity.label || '未设置顾客 OpenID',
    canUse: !!(identity && identity.canUse),
    isMock: !!(identity && identity.isMock),
    isSession: !!(identity && identity.isSession),
    isDefaultMock,
    isDevelopEnv,
    sourceText: identity && identity.canUse
      ? identity.isSession
        ? '当前使用微信顾客 Bearer 会话；我的灵感会按当前登录身份查询。'
        : isDefaultMock
          ? '当前使用开发环境默认顾客 OpenID。'
          : identity.isMock
            ? '当前使用开发环境模拟顾客 OpenID。'
            : '当前使用顾客 OpenID。'
      : isDevelopEnv
        ? '开发环境请填写或生成模拟顾客 OpenID。'
        : '未获取到顾客身份，请重新登录后重试。'
  };
}

function formatPageError(error, fallback) {
  if (error && error.isUnauthorized) {
    return '当前顾客身份无效，请重新登录后重试。';
  }
  return getErrorMessage(error, fallback || '我的灵感加载失败，请稍后重试。');
}

Page({
  data: {
    mode: 'list',
    pageState: 'loading',
    stateMessage: '',
    customerIdentity: {
      openId: '',
      label: '未设置顾客 OpenID',
      canUse: false,
      isMock: false,
      isSession: false,
      isDefaultMock: false,
      isDevelopEnv: false,
      sourceText: ''
    },
    customerOpenIdInput: '',
    items: [],
    pageInfo: {
      hasMore: false,
      nextCursor: ''
    },
    loadingMore: false,
    editingId: '',
    editNote: '',
    savingId: '',
    deletingId: '',
    detailState: 'idle',
    detailItem: null,
    detailMessage: ''
  },

  onLoad(options = {}) {
    this.inspirationId = decodeURIComponent(options.id || '');
    this._listLoaded = false;
    this._listRequestInFlight = false;
    this.setData({ mode: this.inspirationId ? 'detail' : 'list' });
    if (!this.ensureAccess()) {
      return;
    }
    this.refreshCustomerIdentity();
    if (this.inspirationId) {
      this.loadDetail();
    } else {
      this._listLoaded = true;
      this.loadData();
    }
  },

  onShow() {
    if (!this.ensureAccess()) {
      return;
    }
    this.refreshCustomerIdentity();
    // Refresh the list when returning from a detail/gallery page so edits and
    // deletes made there are reflected without changing the WXML contract.
    if (
      this.data.mode === 'list' &&
      this._listLoaded &&
      !this._listRequestInFlight &&
      !this.data.loadingMore &&
      this.data.pageState !== 'loading'
    ) {
      this.loadData();
    }
  },

  async onPullDownRefresh() {
    this.refreshCustomerIdentity();
    if (this.data.mode === 'detail') {
      await this.loadDetail();
    } else {
      await this.loadData();
    }
    wx.stopPullDownRefresh();
  },

  onReachBottom() {
    if (this.data.mode === 'list' && this.data.pageInfo.hasMore && !this.data.loadingMore) {
      this.loadData({ append: true });
    }
  },

  loadMore() {
    if (this.data.pageInfo.hasMore && !this.data.loadingMore) {
      this.loadData({ append: true });
    }
  },

  refreshCustomerIdentity() {
    const customerIdentity = getIdentityMeta();
    this.setData({
      customerIdentity,
      customerOpenIdInput: customerIdentity.openId || this.data.customerOpenIdInput || ''
    });
  },

  ensureAccess() {
    if (hasCustomerAccess()) {
      this.redirectingToLogin = false;
      return true;
    }
    if (!this.redirectingToLogin) {
      this.redirectingToLogin = true;
      const suffix = this.inspirationId ? `?id=${encodeURIComponent(this.inspirationId)}` : '';
      redirectToLogin({ redirect: `/pages/my-inspirations/index${suffix}` });
    }
    return false;
  },

  onCustomerOpenIdInput(event) {
    this.setData({ customerOpenIdInput: event.detail.value });
  },

  applyCustomerOpenId() {
    const value = `${this.data.customerOpenIdInput || ''}`.trim();
    if (!value) {
      wx.showToast({ title: '请先输入顾客 OpenID', icon: 'none' });
      return;
    }
    getApp().setCustomerOpenId(value);
    this.refreshCustomerIdentity();
    this.reloadCurrentView();
  },

  generateCustomerOpenId() {
    getApp().createMockCustomerOpenId();
    this.refreshCustomerIdentity();
    this.reloadCurrentView();
  },

  clearCustomerOpenId() {
    getApp().clearCustomerOpenId();
    this.setData({ customerOpenIdInput: '' });
    this.refreshCustomerIdentity();
    this.reloadCurrentView();
  },

  reloadCurrentView() {
    if (this.data.mode === 'detail') {
      this.loadDetail();
    } else {
      this.loadData();
    }
  },

  async loadData(options = {}) {
    if (!this.ensureAccess()) {
      return;
    }
    const append = !!(options && options.append === true);
    if (!append && this._listRequestInFlight) {
      return;
    }
    if (!append) {
      this._listRequestInFlight = true;
    }
    const customerIdentity = getIdentityMeta();
    if (!customerIdentity.canUse) {
      this.setData({
        customerIdentity,
        pageState: 'unauthorized',
        stateMessage: customerIdentity.isDevelopEnv
          ? '未获取到顾客 OpenID。请填写或生成模拟 OpenID 后再查看我的灵感。'
          : '未获取到顾客身份，请重新登录后再查看我的灵感。',
        items: append ? this.data.items : [],
        loadingMore: false
      });
      if (!append) {
        this._listRequestInFlight = false;
      }
      return;
    }

    if (append) {
      this.setData({ loadingMore: true, stateMessage: '' });
    } else {
      this.setData({
        customerIdentity,
        pageState: 'loading',
        stateMessage: '',
        loadingMore: false,
        pageInfo: { hasMore: false, nextCursor: '' }
      });
    }

    try {
      const params = { limit: PAGE_LIMIT };
      if (append && this.data.pageInfo.nextCursor) {
        params.cursor = this.data.pageInfo.nextCursor;
      }
      const response = await listMyInspirations(params);
      const nextItems = (response.items || []).map(normalizeItem);
      const items = append ? [...this.data.items, ...nextItems] : nextItems;
      const pageInfo = {
        hasMore: !!(response.pageInfo && response.pageInfo.hasMore),
        nextCursor: response.pageInfo && response.pageInfo.nextCursor || ''
      };
      this.setData({
        customerIdentity,
        items,
        pageInfo,
        loadingMore: false,
        pageState: items.length ? 'ready' : 'empty',
        stateMessage: items.length ? '' : '还没有保存的返图灵感，先去返图灵感页收藏喜欢的款式吧。'
      });
    } catch (error) {
      if (isLoginRequiredError(error)) {
        this.redirectingToLogin = false;
        this.ensureAccess();
        return;
      }
      if (append && error && error.isUnauthorized) {
        this.setData({
          customerIdentity,
          loadingMore: false,
          pageState: 'unauthorized',
          stateMessage: formatPageError(error, '当前顾客身份已失效，请重新登录后重试。'),
          items: [],
          pageInfo: { hasMore: false, nextCursor: '' }
        });
        return;
      }

      this.setData({
        customerIdentity,
        loadingMore: false,
        pageState: append
          ? (this.data.items.length ? 'ready' : 'empty')
          : (error.isUnauthorized ? 'unauthorized' : 'error'),
        stateMessage: formatPageError(error, '我的灵感加载失败，请稍后重试。'),
        items: append ? this.data.items : []
      });
      if (append) {
        wx.showToast({
          title: formatPageError(error, '加载更多失败，请稍后重试。'),
          icon: 'none'
        });
      }
    } finally {
      if (!append) {
        this._listRequestInFlight = false;
      }
    }
  },

  async loadDetail() {
    if (!this.ensureAccess()) {
      return;
    }
    const customerIdentity = getIdentityMeta();
    if (!customerIdentity.canUse) {
      this.setData({
        customerIdentity,
        detailState: 'unauthorized',
        detailMessage: customerIdentity.isDevelopEnv
          ? '未获取到顾客 OpenID。请填写或生成模拟 OpenID 后再查看详情。'
          : '未获取到顾客身份，请重新登录后重试。',
        detailItem: null
      });
      return;
    }

    if (!this.inspirationId) {
      this.setData({ detailState: 'empty', detailMessage: '缺少灵感标识。', detailItem: null });
      return;
    }

    this.setData({ customerIdentity, detailState: 'loading', detailMessage: '', detailItem: null });
    try {
      const response = await getMyInspiration(this.inspirationId);
      if (!response || !response.item) {
        throw Object.assign(new Error('灵感详情不存在'), {
          statusCode: 404,
          code: 'INSPIRATION_NOT_FOUND'
        });
      }
      this.setData({
        detailState: 'ready',
        detailItem: normalizeItem(response.item),
        detailMessage: ''
      });
    } catch (error) {
      if (isLoginRequiredError(error)) {
        this.redirectingToLogin = false;
        this.ensureAccess();
        return;
      }
      this.setData({
        detailState: error && error.isUnauthorized
          ? 'unauthorized'
          : error && (error.statusCode === 404 || error.code === 'INSPIRATION_NOT_FOUND')
            ? 'empty'
            : 'error',
        detailMessage: formatPageError(error, '灵感详情加载失败，请稍后重试。'),
        detailItem: null
      });
    }
  },

  openDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) {
      return;
    }
    wx.navigateTo({
      url: `/pages/my-inspirations/index?id=${encodeURIComponent(id)}`
    });
  },

  backToList() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.redirectTo({ url: '/pages/my-inspirations/index' });
  },

  previewImage(event) {
    const item = this.data.detailItem || this.data.items.find(
      (entry) => entry.id === event.currentTarget.dataset.id
    );
    const url = event.currentTarget.dataset.url;
    const urls = item && item.galleryItem && item.galleryItem.imageUrls || [];
    if (url && urls.length) {
      wx.previewImage({ current: url, urls });
    }
  },

  goGalleryDetail(event) {
    const id = event.currentTarget.dataset.galleryId || (() => {
      const inspirationId = event.currentTarget.dataset.id;
      const item = this.data.items.find((entry) => entry.id === inspirationId);
      return item && item.galleryItem && item.galleryItem.id;
    })();
    if (!id) {
      return;
    }
    wx.navigateTo({
      url: `/pages/gallery-detail/index?id=${encodeURIComponent(id)}`
    });
  },

  goGalleryList() {
    wx.navigateTo({ url: '/pages/gallery-list/index' });
  },

  goBooking(event) {
    const item = this.data.detailItem || this.data.items.find(
      (entry) => entry.id === event.currentTarget.dataset.id
    );
    if (!item || !item.galleryItem) {
      return;
    }
    const gallery = item.galleryItem;
    const referenceImageUrl = gallery.imageUrl || gallery.imageUrls[0] || '';
    wx.navigateTo({
      url: `/pages/booking/index?galleryId=${encodeURIComponent(gallery.id)}&galleryTitle=${encodeURIComponent(gallery.title || '')}&referenceImageUrl=${encodeURIComponent(referenceImageUrl)}`
    });
  },

  beginEdit(event) {
    const id = event.currentTarget.dataset.id;
    const item = this.data.detailItem && this.data.detailItem.id === id
      ? this.data.detailItem
      : this.data.items.find((entry) => entry.id === id);
    if (!item) {
      return;
    }
    this.setData({ editingId: id, editNote: item.note || '' });
  },

  onEditNoteInput(event) {
    this.setData({ editNote: event.detail.value });
  },

  cancelEdit() {
    this.setData({ editingId: '', editNote: '' });
  },

  async saveNote(event) {
    const id = event.currentTarget.dataset.id || this.data.editingId;
    if (!id || this.data.savingId) {
      return;
    }
    this.setData({ savingId: id });
    try {
      const response = await updateMyInspiration(id, { note: this.data.editNote || '' });
      const nextItem = normalizeItem(response.item || {});
      this.replaceItem(nextItem);
      this.setData({ editingId: '', editNote: '' });
      wx.showToast({ title: '备注已保存', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: formatPageError(error, '备注保存失败'), icon: 'none' });
    } finally {
      this.setData({ savingId: '' });
    }
  },

  confirmDelete(event) {
    const id = event.currentTarget.dataset.id || (this.data.detailItem && this.data.detailItem.id);
    if (!id || this.data.deletingId) {
      return;
    }
    wx.showModal({
      title: '删除我的灵感',
      content: '删除后将无法在“我的灵感”中继续查看，确认删除吗？',
      confirmText: '删除',
      confirmColor: '#d45a5a',
      success: (result) => {
        if (result.confirm) {
          this.deleteItem(id);
        }
      }
    });
  },

  async deleteItem(id) {
    this.setData({ deletingId: id });
    try {
      await deleteMyInspiration(id);
      if (this.data.mode === 'detail') {
        this.setData({
          detailState: 'empty',
          detailMessage: '这条灵感已删除。',
          detailItem: null
        });
      } else {
        const items = this.data.items.filter((item) => item.id !== id);
        const shouldFillPage = !!(
          this.data.pageInfo.hasMore &&
          this.data.pageInfo.nextCursor
        );
        this.setData({
          items,
          pageState: items.length ? 'ready' : 'empty',
          stateMessage: items.length ? '' : '还没有保存的返图灵感。'
        });
        // Keep the visible page full after deleting an item at a page boundary.
        if (shouldFillPage) {
          await this.loadData({ append: true });
        }
      }
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: formatPageError(error, '删除失败，请稍后重试。'), icon: 'none' });
    } finally {
      this.setData({ deletingId: '' });
    }
  },

  replaceItem(nextItem) {
    if (!nextItem || !nextItem.id) {
      return;
    }
    const items = this.data.items.map((item) => item.id === nextItem.id ? nextItem : item);
    const update = { items };
    if (this.data.detailItem && this.data.detailItem.id === nextItem.id) {
      update.detailItem = nextItem;
    }
    this.setData(update);
  }
});
