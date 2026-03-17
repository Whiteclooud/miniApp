const {
  listStaffAppointments,
  reviewStaffAppointment
} = require('../../../services/appointment');
const {
  ensureStaffIdentity,
  setStaffOpenId,
  clearStaffOpenId,
  createMockStaffOpenId
} = require('../../../utils/staff');
const { getErrorKind, getErrorMessage } = require('../../../utils/request');
const { isDevelopEnv } = require('../../../utils/customer');

function formatStatus(status) {
  const map = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝'
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
  return (items || []).map((item, index) => {
    const status = item.status || 'pending';
    return {
      id: item.id || `staff-appointment-${index}`,
      customerName: item.customerName || '未填写',
      phone: item.phone || '未填写',
      date: item.appointmentDate || item.date || '-',
      timeSlot: item.timeSlot || '-',
      note: item.note || '',
      status,
      statusText: formatStatus(status),
      createdAtText: formatTime(item.createdAt),
      canReview: status === 'pending'
    };
  });
}

function buildSummary(appointments) {
  const total = appointments.length;
  const pending = appointments.filter((item) => item.status === 'pending').length;
  return {
    total,
    pending
  };
}

function getStaffIdentityMeta() {
  const identity = ensureStaffIdentity();
  const develop = isDevelopEnv();
  return {
    openId: identity.openId,
    label: identity.label,
    canUse: identity.canUse,
    isMock: identity.isMock,
    isDevelopEnv: develop,
    sourceText: identity.canUse
      ? identity.isMock
        ? '当前为开发环境模拟店员身份；店员接口将通过 X-Staff-OpenId 调用。'
        : '当前为店员身份；店员接口将通过 X-Staff-OpenId 调用。'
      : develop
        ? '未设置店员 OpenID。开发环境请先填写或生成模拟 OpenID。'
        : '未获取到店员 OpenID，当前无法查询店员页。'
  };
}

function formatPageErrorMessage(error, fallback) {
  const kind = getErrorKind(error);
  if (kind === 'network') {
    return '网络异常，店员预约列表暂时加载失败。请确认本地服务已启动并允许开发者工具访问。';
  }

  if (kind === 'unauthorized') {
    return getErrorMessage(error, fallback || '当前身份无权查看店员预约列表。');
  }

  return getErrorMessage(error, fallback || '店员预约列表加载失败，请稍后重试。');
}

function formatReviewErrorMessage(error, actionText) {
  const kind = getErrorKind(error);
  if (kind === 'network') {
    return `网络异常，本次${actionText}没有成功，请检查服务端或网络连接后重试。`;
  }

  if (kind === 'bad-request') {
    return getErrorMessage(error, `本次${actionText}失败，请检查预约状态后重试。`);
  }

  if (kind === 'unauthorized') {
    return getErrorMessage(error, `当前身份无权执行${actionText}。`);
  }

  return getErrorMessage(error, `${actionText}失败，请稍后重试。`);
}

Page({
  data: {
    pageState: 'loading',
    stateMessage: '',
    reviewMessage: '',
    reviewStateMap: {},
    staffIdentity: {
      openId: '',
      label: '未设置店员 OpenID',
      canUse: false,
      isMock: false,
      isDevelopEnv: false,
      sourceText: ''
    },
    staffOpenIdInput: '',
    appointments: [],
    summary: {
      total: 0,
      pending: 0
    }
  },

  onLoad() {
    this.refreshStaffIdentity();
  },

  onShow() {
    this.refreshStaffIdentity();
    this.loadData();
  },

  async onPullDownRefresh() {
    this.refreshStaffIdentity();
    await this.loadData();
    wx.stopPullDownRefresh();
  },

  refreshStaffIdentity() {
    const staffIdentity = getStaffIdentityMeta();
    this.setData({
      staffIdentity,
      staffOpenIdInput: staffIdentity.openId || this.data.staffOpenIdInput || ''
    });
  },

  onStaffOpenIdInput(event) {
    this.setData({
      staffOpenIdInput: event.detail.value
    });
  },

  applyStaffOpenId() {
    const value = (this.data.staffOpenIdInput || '').trim();
    if (!value) {
      wx.showToast({ title: '请先输入店员 OpenID', icon: 'none' });
      return;
    }

    setStaffOpenId(value);
    this.refreshStaffIdentity();
    this.loadData();
    wx.showToast({ title: '店员 OpenID 已保存', icon: 'success' });
  },

  generateStaffOpenId() {
    setStaffOpenId(createMockStaffOpenId());
    this.refreshStaffIdentity();
    this.loadData();
    wx.showToast({ title: '已生成模拟店员 OpenID', icon: 'success' });
  },

  clearStaffOpenId() {
    clearStaffOpenId();
    this.refreshStaffIdentity();
    this.setData({
      staffOpenIdInput: '',
      appointments: [],
      reviewStateMap: {},
      reviewMessage: '',
      summary: { total: 0, pending: 0 },
      pageState: 'unauthorized',
      stateMessage: '店员 OpenID 已清空，店员页不会再静默请求 staff 接口。'
    });
    wx.showToast({ title: '已清空店员 OpenID', icon: 'none' });
  },

  goRules() {
    wx.redirectTo({
      url: '/pages/staff/rules/index'
    });
  },

  async loadData() {
    const staffIdentity = getStaffIdentityMeta();
    if (!staffIdentity.canUse) {
      this.setData({
        staffIdentity,
        appointments: [],
        reviewStateMap: {},
        reviewMessage: '',
        summary: { total: 0, pending: 0 },
        pageState: 'unauthorized',
        stateMessage: staffIdentity.isDevelopEnv
          ? '未获取到店员 OpenID。开发环境请先填写或生成模拟 OpenID，再查询店员预约列表。'
          : '未获取到店员 OpenID，当前无法查询店员页。'
      });
      return;
    }

    this.setData({
      staffIdentity,
      pageState: 'loading',
      stateMessage: '',
      reviewMessage: '',
      reviewStateMap: {}
    });

    try {
      const response = await listStaffAppointments();
      const appointments = normalizeAppointments(response.items || []);
      const summary = buildSummary(appointments);
      this.setData({
        appointments,
        summary,
        pageState: appointments.length ? 'ready' : 'empty',
        stateMessage: appointments.length ? '' : '当前暂无门店预约记录。'
      });
    } catch (error) {
      this.setData({
        appointments: [],
        reviewStateMap: {},
        summary: { total: 0, pending: 0 },
        pageState: error.isUnauthorized ? 'unauthorized' : 'error',
        stateMessage: formatPageErrorMessage(error, '店员预约列表加载失败，请稍后重试。')
      });
    }
  },

  async reviewAppointment(event) {
    const { id, action } = event.currentTarget.dataset;
    const { staffIdentity } = this.data;

    if (!staffIdentity.canUse) {
      this.setData({
        pageState: 'unauthorized',
        stateMessage: '缺少店员 OpenID，当前不能执行预约审核。'
      });
      wx.showToast({ title: '缺少店员 OpenID', icon: 'none' });
      return;
    }

    if (!id || !action) {
      return;
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    const actionText = action === 'approve' ? '通过预约' : '拒绝预约';
    const stateKey = `reviewStateMap.${id}`;
    const nextState = action === 'approve' ? 'approving' : 'rejecting';

    this.setData({
      reviewMessage: '',
      [stateKey]: nextState
    });

    try {
      await reviewStaffAppointment(id, { status });
      wx.showToast({
        title: action === 'approve' ? '已通过' : '已拒绝',
        icon: 'success'
      });
      await this.loadData();
    } catch (error) {
      if (error.isUnauthorized) {
        this.setData({
          pageState: 'unauthorized',
          stateMessage: formatPageErrorMessage(error, `当前身份无权执行${actionText}。`)
        });
        return;
      }

      this.setData({
        reviewMessage: formatReviewErrorMessage(error, actionText),
        [stateKey]: 'idle'
      });
      wx.showToast({ title: '审核失败', icon: 'none' });
    } finally {
      if (this.data.reviewStateMap[id]) {
        this.setData({
          [stateKey]: 'idle'
        });
      }
    }
  }
});
