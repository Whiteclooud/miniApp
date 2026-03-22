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
    apiProfileKey: 'legacy',
    canSwitchApiProfile: false,
    isDevelopEnv: false,
    switchingApiProfile: false
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

  async applyApiProfile(profileKey, successText) {
    if (this.data.switchingApiProfile) {
      return;
    }

    const app = getApp();
    this.setData({ switchingApiProfile: true });

    try {
      if (profileKey) {
        app.setApiProfile(profileKey);
      } else {
        app.resetApiProfile();
      }

      this.syncApiProfileState();
      await this.loadData();
      wx.showToast({
        title: successText,
        icon: 'none'
      });
    } finally {
      this.setData({ switchingApiProfile: false });
    }
  },

  switchToApiProfile() {
    this.applyApiProfile('api', '已切到 apps/api');
  },

  switchToLegacyProfile() {
    this.applyApiProfile('legacy', '已切到 apps/server');
  },

  resetApiProfile() {
    this.applyApiProfile('', '已恢复默认基线');
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
