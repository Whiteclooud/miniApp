const { cancelMyAppointment, listMyAppointments } = require('../../services/appointment');
const { getErrorKind, getErrorMessage } = require('../../utils/request');
const { DEFAULT_DEVELOP_CUSTOMER_OPENID } = require('../../utils/customer');
const { hasCustomerAccess, isLoginRequiredError, redirectToLogin } = require('../../utils/login-guard');

function formatStatus(status) {
  const map = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝',
    cancelled: '已取消',
    completed: '已完成',
    no_show: '未到店'
  };
  return map[status] || status || '待处理';
}

function formatTime(text) {
  if (!text) {
    return '';
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text;
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function normalizeAppointments(items) {
  return (items || []).map((item, index) => ({
    id: item.id || `appointment-${index}`,
    customerName: item.customerName || '未填写',
    phone: item.phone || '未填写',
    date: item.appointmentDate || item.date || '-',
    timeSlot: item.timeSlot || '-',
    note: item.note || '',
    referenceImageUrls: Array.isArray(item.referenceImageUrls)
      ? item.referenceImageUrls.filter((url) => typeof url === 'string' && url.trim())
      : [],
    reviewNote: item.reviewNote || '',
    cancelReason: item.cancelReason || '',
    cancelledAtText: formatTime(item.cancelledAt),
    arrivalInstructions: item.arrivalInstructions || null,
    canCancel: item.status === 'pending' || item.status === 'approved',
    status: item.status || 'pending',
    reviewedAtText: formatTime(item.reviewedAt),
    statusText: formatStatus(item.status),
    createdAtText: formatTime(item.createdAt)
  }));
}

function getIdentityMeta() {
  const app = getApp();
  const identity = app.getCustomerIdentity ? app.getCustomerIdentity() : app.globalData.customerIdentity;
  const isDefaultMock = identity.isDefaultMock || identity.openId === DEFAULT_DEVELOP_CUSTOMER_OPENID;
  const headerFallbackEnabled = !!(app.globalData && app.globalData.allowHeaderAuthFallback);

  return {
    openId: identity.openId,
    label: identity.label,
    canUse: identity.canUse,
    isMock: identity.isMock,
    isDefaultMock,
    isDevelopEnv: !!app.globalData.isDevelopEnv && headerFallbackEnabled,
    sourceText: identity.canUse
      ? identity.isSession
        ? '当前使用微信顾客 Bearer 会话；“我的预约”会按当前登录身份查询。'
        : isDefaultMock
        ? '当前使用开发环境默认顾客 OpenID（customer-openid-demo）；“我的预约”将按该 OpenID 自动查询。'
        : identity.isMock
          ? '当前为开发环境自定义顾客 OpenID；“我的预约”将按该 OpenID 自动查询。'
          : '“我的预约”将按当前顾客 OpenID 自动查询。'
      : app.globalData.isDevelopEnv
        ? '未设置顾客 OpenID。开发环境请先填写或生成模拟顾客 OpenID，再查询“我的预约”。'
        : '未获取到顾客 OpenID，当前无法查询“我的预约”。'
  };
}

function formatPageErrorMessage(error, fallback) {
  const kind = getErrorKind(error);
  if (kind === 'network') {
    return '网络异常，“我的预约”暂时加载失败。请确认本地服务已启动并允许开发者工具访问。';
  }

  if (kind === 'unauthorized') {
    return getErrorMessage(error, fallback || '当前顾客身份无权查看预约记录。');
  }

  return getErrorMessage(error, fallback || '“我的预约”加载失败，请稍后重试。');
}

Page({
  data: {
    pageState: 'loading',
    stateMessage: '',
    appointments: [],
    customerIdentity: {
      openId: '',
      label: '未设置顾客 OpenID',
      canUse: false,
      isMock: false,
      isDefaultMock: false,
      isDevelopEnv: false,
      sourceText: ''
    },
    customerOpenIdInput: ''
  },

  onLoad() {
    if (!this.ensureAccess()) {
      return;
    }
    this.refreshCustomerIdentity();
  },

  onShow() {
    if (!this.ensureAccess()) {
      return;
    }
    this.refreshCustomerIdentity();
    this.loadData();
  },

  async onPullDownRefresh() {
    this.refreshCustomerIdentity();
    await this.loadData();
    wx.stopPullDownRefresh();
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
      redirectToLogin({ redirect: '/pages/my-bookings/index' });
    }
    return false;
  },

  onCustomerOpenIdInput(event) {
    this.setData({
      customerOpenIdInput: event.detail.value
    });
  },

  applyCustomerOpenId() {
    const value = (this.data.customerOpenIdInput || '').trim();
    if (!value) {
      wx.showToast({ title: '请先输入顾客 OpenID', icon: 'none' });
      return;
    }

    getApp().setCustomerOpenId(value);
    this.refreshCustomerIdentity();
    this.loadData();
    wx.showToast({ title: '顾客 OpenID 已保存', icon: 'success' });
  },

  generateCustomerOpenId() {
    getApp().createMockCustomerOpenId();
    this.refreshCustomerIdentity();
    this.loadData();
    wx.showToast({ title: '已生成模拟 OpenID', icon: 'success' });
  },

  clearCustomerOpenId() {
    getApp().clearCustomerOpenId();
    this.setData({
      customerOpenIdInput: '',
      appointments: []
    });
    this.refreshCustomerIdentity();
    this.loadData();
    wx.showToast({ title: '已清空顾客 OpenID', icon: 'none' });
  },

  async loadData() {
    if (!this.ensureAccess()) {
      return;
    }
    const customerIdentity = getIdentityMeta();
    if (!customerIdentity.canUse) {
      this.setData({
        customerIdentity,
        appointments: [],
        pageState: 'unauthorized',
        stateMessage: customerIdentity.isDevelopEnv
          ? '未获取到顾客 OpenID。开发环境请先填写或生成模拟顾客 OpenID，再查询“我的预约”。'
          : '未获取到顾客 OpenID，当前无法查询“我的预约”。'
      });
      return;
    }

    this.setData({
      customerIdentity,
      pageState: 'loading',
      stateMessage: ''
    });

    try {
      const response = await listMyAppointments();
      const appointments = normalizeAppointments(response.items || []);
      this.setData({
        appointments,
        pageState: appointments.length ? 'ready' : 'empty',
        stateMessage: appointments.length ? '' : '当前顾客 OpenID 下暂无预约记录。'
      });
    } catch (error) {
      if (isLoginRequiredError(error)) {
        this.redirectingToLogin = false;
        this.ensureAccess();
        return;
      }
      this.setData({
        appointments: [],
        pageState: error.isUnauthorized ? 'unauthorized' : 'error',
        stateMessage: formatPageErrorMessage(error, '“我的预约”加载失败，请稍后重试。')
      });
    }
  },

  cancelAppointment(event) {
    const { id } = event.currentTarget.dataset;
    if (!id) {
      return;
    }

    wx.showModal({
      title: '取消预约',
      content: '确认取消这条预约吗？已通过的预约取消后会释放时段。',
      confirmText: '确认取消',
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        try {
          await cancelMyAppointment(id, { reason: '顾客主动取消' });
          wx.showToast({ title: '已取消', icon: 'success' });
          await this.loadData();
        } catch (error) {
          wx.showToast({
            title: formatPageErrorMessage(error, '取消失败，请稍后重试。'),
            icon: 'none'
          });
        }
      }
    });
  },

  previewReferenceImage(event) {
    const { id, url } = event.currentTarget.dataset;
    const appointment = this.data.appointments.find((item) => item.id === id);
    if (!appointment || !url || !appointment.referenceImageUrls.length) {
      return;
    }

    wx.previewImage({
      current: url,
      urls: appointment.referenceImageUrls
    });
  }
});
