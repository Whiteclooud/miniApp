const {
  listStaffAppointments,
  reviewAppointment
} = require('../../../services/appointment');
const { STAFF_OPEN_ID_STORAGE_KEY } = require('../../../utils/request');

const STATUS_OPTIONS = [
  { label: '待审核', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已拒绝', value: 'rejected' }
];

const STATUS_MAP = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝'
};

Page({
  data: {
    authInput: '',
    authorized: false,
    loading: false,
    reviewingId: '',
    statusFilter: 'pending',
    currentStatusLabel: '待审核',
    statusOptions: STATUS_OPTIONS,
    items: [],
    reviewNotes: {}
  },

  onLoad() {
    const authInput = wx.getStorageSync(STAFF_OPEN_ID_STORAGE_KEY) || '';
    this.setData({ authInput });
    if (authInput) {
      this.loadAppointments();
    }
  },

  onShow() {
    if (this.data.authorized) {
      this.loadAppointments();
    }
  },

  async onPullDownRefresh() {
    if (this.data.authorized) {
      await this.loadAppointments();
    }
    wx.stopPullDownRefresh();
  },

  onAuthInput(e) {
    this.setData({ authInput: e.detail.value });
  },

  saveAuthInput() {
    const { authInput } = this.data;
    if (!authInput) {
      wx.showToast({ title: '请输入店员 OpenID', icon: 'none' });
      return;
    }
    wx.setStorageSync(STAFF_OPEN_ID_STORAGE_KEY, authInput.trim());
    this.loadAppointments();
  },

  normalizeItems(items) {
    return (items || []).map((item) => ({
      ...item,
      statusText: STATUS_MAP[item.status] || '待审核'
    }));
  },

  async loadAppointments() {
    this.setData({ loading: true });
    try {
      const res = await listStaffAppointments(this.data.statusFilter);
      this.setData({
        authorized: true,
        items: this.normalizeItems(res.items || []),
        loading: false
      });
    } catch (error) {
      if (error.code === 'STAFF_UNAUTHORIZED') {
        this.setData({ authorized: false, items: [], loading: false });
        wx.showToast({ title: '当前账号无店员权限', icon: 'none' });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: '预约列表加载失败', icon: 'none' });
    }
  },

  onStatusChange(e) {
    const index = Number(e.detail.value);
    this.setData(
      {
        statusFilter: STATUS_OPTIONS[index].value,
        currentStatusLabel: STATUS_OPTIONS[index].label
      },
      () => this.loadAppointments()
    );
  },

  onReviewNoteInput(e) {
    const { id } = e.currentTarget.dataset;
    this.setData({
      [`reviewNotes.${id}`]: e.detail.value
    });
  },

  async review(e) {
    const { id, action } = e.currentTarget.dataset;
    if (!id || !action || this.data.reviewingId) {
      return;
    }

    this.setData({ reviewingId: id });
    try {
      await reviewAppointment(id, {
        action,
        reviewNote: this.data.reviewNotes[id] || ''
      });
      wx.showToast({ title: action === 'approve' ? '已通过' : '已拒绝', icon: 'success' });
      this.loadAppointments();
    } catch (error) {
      let title = '操作失败';
      if (error.code === 'SLOT_OCCUPIED') {
        title = '该时间段已被占用';
      } else if (error.code === 'ALREADY_REVIEWED') {
        title = '该预约已审核';
      } else if (error.code === 'STAFF_UNAUTHORIZED') {
        title = '当前账号无店员权限';
      }
      wx.showToast({ title, icon: 'none' });
    } finally {
      this.setData({ reviewingId: '' });
    }
  },

  goRules() {
    wx.navigateTo({
      url: '/pages/staff/rules/index'
    });
  }
});
