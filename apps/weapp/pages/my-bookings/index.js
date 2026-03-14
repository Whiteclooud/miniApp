const { listMyAppointments } = require('../../services/appointment');

const STATUS_MAP = {
  pending: { text: '待审核', type: 'pending' },
  approved: { text: '已通过', type: 'approved' },
  rejected: { text: '已拒绝', type: 'rejected' }
};

function normalizeItems(items) {
  return (items || []).map((item) => ({
    ...item,
    statusText: (STATUS_MAP[item.status] || STATUS_MAP.pending).text,
    statusType: (STATUS_MAP[item.status] || STATUS_MAP.pending).type
  }));
}

Page({
  data: {
    phone: '',
    items: [],
    loading: false,
    searched: false
  },

  onLoad(options) {
    const phone = options.phone || wx.getStorageSync('lastBookingPhone') || '';
    this.setData({ phone });
    if (phone) {
      this.loadAppointments(phone);
    }
  },

  async onPullDownRefresh() {
    if (this.data.phone) {
      await this.loadAppointments(this.data.phone);
    }
    wx.stopPullDownRefresh();
  },

  onInput(e) {
    this.setData({ phone: e.detail.value });
  },

  async loadAppointments(phone) {
    this.setData({ loading: true, searched: true });
    try {
      const res = await listMyAppointments(phone);
      this.setData({
        items: normalizeItems(res.items || []),
        loading: false
      });
    } catch (error) {
      this.setData({
        items: [],
        loading: false
      });
      wx.showToast({
        title: '查询失败',
        icon: 'none'
      });
    }
  },

  search() {
    const { phone } = this.data;
    if (!phone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' });
      return;
    }
    wx.setStorageSync('lastBookingPhone', phone);
    this.loadAppointments(phone);
  },

  goBooking() {
    wx.navigateTo({
      url: '/pages/booking/index'
    });
  }
});
