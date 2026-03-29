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

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const DETAIL_FILTER_DEFINITIONS = [
  { key: 'all', label: '全部预约' },
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'history', label: '历史预约' }
];

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

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isDateText(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(`${value || ''}`);
}

function formatMonthLabel(cursor) {
  const [year, month] = `${cursor}`.split('-');
  return `${year} 年 ${Number(month)} 月`;
}

function createMonthCursor(date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}

function getTodayKey() {
  return formatDateKey(new Date());
}

function getMonthDateRange(cursor) {
  const [yearText, monthText] = `${cursor}`.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const firstDate = new Date(year, monthIndex, 1);
  const lastDate = new Date(year, monthIndex + 1, 0);
  return { firstDate, lastDate };
}

function shiftMonthCursor(cursor, delta) {
  const { firstDate } = getMonthDateRange(cursor);
  return createMonthCursor(new Date(firstDate.getFullYear(), firstDate.getMonth() + delta, 1));
}

function isStatusFilterKey(value) {
  return value === 'pending' || value === 'approved' || value === 'rejected';
}

function normalizeAppointments(items) {
  const today = getTodayKey();

  return (items || []).map((item, index) => {
    const status = item.status || 'pending';
    const date = item.appointmentDate || item.date || '-';
    return {
      id: item.id || `staff-appointment-${index}`,
      customerName: item.customerName || '未填写',
      phone: item.phone || '未填写',
      date,
      timeSlot: item.timeSlot || '-',
      note: item.note || '',
      reviewNote: item.reviewNote || '',
      status,
      statusText: formatStatus(status),
      createdAtText: formatTime(item.createdAt),
      reviewedAtText: formatTime(item.reviewedAt),
      canReview: true,
      showApproveAction: status !== 'approved',
      showRejectAction: status !== 'rejected',
      approveActionText: status === 'pending' ? '通过预约' : '改为通过',
      rejectActionText: status === 'pending' ? '驳回预约' : '改为拒绝',
      reviewHint: status === 'pending' ? '待审核预约可直接处理。' : '当前支持改判，系统以最新审核结果为准。',
      isHistory: isDateText(date) && date < today
    };
  }).sort((left, right) => {
    const dateCompare = `${left.date}`.localeCompare(`${right.date}`);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return `${left.timeSlot}`.localeCompare(`${right.timeSlot}`);
  });
}

function buildSummary(appointments) {
  return {
    total: appointments.length,
    pending: appointments.filter((item) => item.status === 'pending').length,
    approved: appointments.filter((item) => item.status === 'approved').length,
    rejected: appointments.filter((item) => item.status === 'rejected').length
  };
}

function groupAppointmentsByDate(appointments) {
  return appointments.reduce((result, item) => {
    if (!result[item.date]) {
      result[item.date] = [];
    }
    result[item.date].push(item);
    return result;
  }, {});
}

function buildDayStat(items) {
  return {
    total: items.length,
    pending: items.filter((item) => item.status === 'pending').length,
    approved: items.filter((item) => item.status === 'approved').length,
    rejected: items.filter((item) => item.status === 'rejected').length
  };
}

function buildCustomerPreviewName(item) {
  const customerName = `${item.customerName || ''}`.trim();
  if (customerName && customerName !== '未填写') {
    return customerName.length > 4 ? `${customerName.slice(0, 4)}…` : customerName;
  }

  const phone = `${item.phone || ''}`.trim();
  if (/^1\d{10}$/.test(phone)) {
    return `${phone.slice(0, 3)}***${phone.slice(-2)}`;
  }

  return '未留名';
}

function buildCalendarState(appointments, cursor, preferredDate) {
  const groupedAppointments = groupAppointmentsByDate(appointments);
  const todayKey = getTodayKey();
  const { firstDate, lastDate } = getMonthDateRange(cursor);
  const startDate = new Date(firstDate);
  startDate.setDate(firstDate.getDate() - firstDate.getDay());
  const endDate = new Date(lastDate);
  endDate.setDate(lastDate.getDate() + (6 - lastDate.getDay()));

  const monthDates = Object.keys(groupedAppointments)
    .filter((date) => date >= formatDateKey(firstDate) && date <= formatDateKey(lastDate))
    .sort();

  const selectedDate = preferredDate
    || monthDates[0]
    || (todayKey >= formatDateKey(firstDate) && todayKey <= formatDateKey(lastDate) ? todayKey : formatDateKey(firstDate));

  const cells = [];
  for (let current = new Date(startDate); current <= endDate; current.setDate(current.getDate() + 1)) {
    const key = formatDateKey(current);
    const items = groupedAppointments[key] || [];
    const stat = buildDayStat(items);
    const customerPreviewNames = items.slice(0, 3).map(buildCustomerPreviewName);
    cells.push({
      key,
      date: key,
      dayNumber: current.getDate(),
      isCurrentMonth: current.getMonth() === firstDate.getMonth(),
      isToday: key === todayKey,
      isSelected: key === selectedDate,
      total: stat.total,
      pending: stat.pending,
      approved: stat.approved,
      rejected: stat.rejected,
      hasItems: stat.total > 0,
      pendingText: stat.pending ? `待${stat.pending}` : '',
      approvedText: stat.approved ? `过${stat.approved}` : '',
      rejectedText: stat.rejected ? `拒${stat.rejected}` : '',
      customerPreviewNames,
      extraCustomerCount: Math.max(items.length - customerPreviewNames.length, 0)
    });
  }

  const calendarWeeks = [];
  for (let index = 0; index < cells.length; index += 7) {
    calendarWeeks.push(cells.slice(index, index + 7));
  }

  const selectedItems = groupedAppointments[selectedDate] || [];
  return {
    monthCursor: cursor,
    monthLabel: formatMonthLabel(cursor),
    calendarWeeks,
    selectedDate,
    selectedDateMeta: {
      label: selectedDate || '请选择日期',
      totalText: selectedItems.length ? `当天共 ${selectedItems.length} 条预约，已按时间段排序展示。` : '当天暂无预约'
    },
    dayAppointments: selectedItems
  };
}

function buildStatusLists(appointments) {
  return {
    pendingAppointments: appointments.filter((item) => item.status === 'pending'),
    approvedAppointments: appointments.filter((item) => item.status === 'approved'),
    rejectedAppointments: appointments.filter((item) => item.status === 'rejected'),
    historyAppointments: appointments.filter((item) => item.isHistory)
  };
}

function buildDetailFilters(activeKey, summary, historyCount) {
  const counts = {
    all: summary.total,
    pending: summary.pending,
    approved: summary.approved,
    rejected: summary.rejected,
    history: historyCount
  };

  return DETAIL_FILTER_DEFINITIONS.map((item) => ({
    key: item.key,
    label: item.label,
    count: counts[item.key] || 0,
    isActive: item.key === activeKey
  }));
}

function buildDetailListView(filterKey, allAppointments, remoteAppointments) {
  const appointments = allAppointments || [];

  if (filterKey === 'pending') {
    return {
      title: '待审核列表',
      description: '显式筛选“待审核”时会按 status=pending 重新请求明细；月历与当天明细仍基于默认全量列表。',
      items: Array.isArray(remoteAppointments) ? remoteAppointments : appointments.filter((item) => item.status === 'pending'),
      emptyText: '当前没有待审核预约。',
      noticeText: Array.isArray(remoteAppointments) ? '当前筛选已按 status=pending 重新请求 staff appointments 列表。' : ''
    };
  }

  if (filterKey === 'approved') {
    return {
      title: '已通过列表',
      description: '显式筛选“已通过”时会按 status=approved 重新请求明细；便于回看已确认安排。',
      items: Array.isArray(remoteAppointments) ? remoteAppointments : appointments.filter((item) => item.status === 'approved'),
      emptyText: '当前没有已通过预约。',
      noticeText: Array.isArray(remoteAppointments) ? '当前筛选已按 status=approved 重新请求 staff appointments 列表。' : ''
    };
  }

  if (filterKey === 'rejected') {
    return {
      title: '已拒绝列表',
      description: '显式筛选“已拒绝”时会按 status=rejected 重新请求明细；便于复盘异常预约。',
      items: Array.isArray(remoteAppointments) ? remoteAppointments : appointments.filter((item) => item.status === 'rejected'),
      emptyText: '当前没有已拒绝预约。',
      noticeText: Array.isArray(remoteAppointments) ? '当前筛选已按 status=rejected 重新请求 staff appointments 列表。' : ''
    };
  }

  if (filterKey === 'history') {
    return {
      title: '历史预约',
      description: '历史预约基于默认未传 status 的完整列表聚合，用于回看已发生日期的全部预约信息。',
      items: appointments.filter((item) => item.isHistory),
      emptyText: '当前没有历史预约记录。',
      noticeText: '历史预约与月历总览都基于默认未传 status 的完整 staff appointments 列表。'
    };
  }

  return {
    title: '全部预约',
    description: '默认展示未传 status 的完整预约列表；切换到待审核 / 已通过 / 已拒绝时，再按 status 重新请求明细。',
    items: appointments,
    emptyText: '当前暂无门店预约记录。',
    noticeText: '月历与当天明细始终基于默认未传 status 的完整 staff appointments 列表聚合。'
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

function getEmptyDashboardState(filterKey = 'all') {
  const summary = { total: 0, pending: 0, approved: 0, rejected: 0 };
  const detailView = buildDetailListView(filterKey, []);
  const calendarState = buildCalendarState([], createMonthCursor(new Date()), '');
  return {
    appointments: [],
    summary,
    pendingAppointments: [],
    approvedAppointments: [],
    rejectedAppointments: [],
    historyAppointments: [],
    activeListFilter: filterKey,
    detailFilters: buildDetailFilters(filterKey, summary, 0),
    listAppointments: detailView.items,
    listState: 'idle',
    detailSectionTitle: detailView.title,
    detailSectionDesc: detailView.description,
    detailListNotice: detailView.noticeText,
    detailEmptyText: detailView.emptyText,
    ...calendarState
  };
}

Page({
  data: {
    pageState: 'loading',
    stateMessage: '',
    reviewMessage: '',
    reviewStateMap: {},
    listState: 'idle',
    staffIdentity: {
      openId: '',
      label: '未设置店员 OpenID',
      canUse: false,
      isMock: false,
      isDevelopEnv: false,
      sourceText: ''
    },
    staffOpenIdInput: '',
    weekLabels: WEEK_LABELS,
    ...getEmptyDashboardState('all')
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
      reviewStateMap: {},
      reviewMessage: '',
      pageState: 'unauthorized',
      stateMessage: '店员 OpenID 已清空，店员页不会再静默请求 staff 接口。',
      ...getEmptyDashboardState(this.data.activeListFilter || 'all')
    });
    wx.showToast({ title: '已清空店员 OpenID', icon: 'none' });
  },

  goRules() {
    wx.redirectTo({
      url: '/pages/staff/rules/index'
    });
  },

  goGallery() {
    wx.redirectTo({
      url: '/pages/staff/gallery/index'
    });
  },

  changeMonth(event) {
    const { delta } = event.currentTarget.dataset;
    const nextCursor = shiftMonthCursor(this.data.monthCursor, Number(delta || 0));
    const calendarState = buildCalendarState(this.data.appointments || [], nextCursor, '');
    this.setData(calendarState);
  },

  resetToCurrentMonth() {
    const calendarState = buildCalendarState(this.data.appointments || [], createMonthCursor(new Date()), '');
    this.setData(calendarState);
  },

  onCalendarDayTap(event) {
    const { date } = event.currentTarget.dataset;
    const calendarState = buildCalendarState(this.data.appointments || [], this.data.monthCursor, date);
    this.setData(calendarState);
  },

  async onDetailFilterTap(event) {
    const filterKey = event.currentTarget.dataset.value || 'all';
    if (filterKey === this.data.activeListFilter && this.data.listState !== 'error') {
      return;
    }

    await this.loadDetailList(filterKey);
  },

  async loadDetailList(filterKey, options = {}) {
    const nextFilterKey = DETAIL_FILTER_DEFINITIONS.some((item) => item.key === filterKey) ? filterKey : 'all';
    const appointments = options.appointments || this.data.appointments || [];
    const summary = options.summary || this.data.summary || buildSummary(appointments);
    const historyAppointments = options.historyAppointments || this.data.historyAppointments || [];
    const detailFilters = buildDetailFilters(nextFilterKey, summary, historyAppointments.length);

    if (!isStatusFilterKey(nextFilterKey)) {
      const detailView = buildDetailListView(nextFilterKey, appointments);
      this.setData({
        activeListFilter: nextFilterKey,
        detailFilters,
        listAppointments: detailView.items,
        listState: 'ready',
        detailSectionTitle: detailView.title,
        detailSectionDesc: detailView.description,
        detailListNotice: detailView.noticeText,
        detailEmptyText: detailView.emptyText
      });
      return;
    }

    const loadingView = buildDetailListView(nextFilterKey, appointments);
    this.setData({
      activeListFilter: nextFilterKey,
      detailFilters,
      listAppointments: loadingView.items,
      listState: 'loading',
      detailSectionTitle: loadingView.title,
      detailSectionDesc: loadingView.description,
      detailListNotice: `正在按 status=${nextFilterKey} 刷新预约明细；月历与当天明细仍基于完整列表展示。`,
      detailEmptyText: loadingView.emptyText
    });

    try {
      const response = await listStaffAppointments({ status: nextFilterKey });
      const remoteAppointments = normalizeAppointments(response.items || []);
      const detailView = buildDetailListView(nextFilterKey, appointments, remoteAppointments);
      this.setData({
        activeListFilter: nextFilterKey,
        detailFilters,
        listAppointments: detailView.items,
        listState: 'ready',
        detailSectionTitle: detailView.title,
        detailSectionDesc: detailView.description,
        detailListNotice: detailView.noticeText,
        detailEmptyText: detailView.emptyText
      });
    } catch (error) {
      const fallbackView = buildDetailListView(nextFilterKey, appointments);
      this.setData({
        activeListFilter: nextFilterKey,
        detailFilters,
        listAppointments: fallbackView.items,
        listState: 'error',
        detailSectionTitle: fallbackView.title,
        detailSectionDesc: fallbackView.description,
        detailListNotice: `${formatPageErrorMessage(error, `按状态筛选 ${fallbackView.title} 失败。`)} 当前先展示基于完整列表的本地筛选结果。`,
        detailEmptyText: fallbackView.emptyText
      });
    }
  },

  async loadData() {
    const staffIdentity = getStaffIdentityMeta();
    if (!staffIdentity.canUse) {
      this.setData({
        staffIdentity,
        reviewStateMap: {},
        reviewMessage: '',
        pageState: 'unauthorized',
        stateMessage: staffIdentity.isDevelopEnv
          ? '未获取到店员 OpenID。开发环境请先填写或生成模拟 OpenID，再查询店员预约列表。'
          : '未获取到店员 OpenID，当前无法查询店员页。',
        ...getEmptyDashboardState(this.data.activeListFilter || 'all')
      });
      return;
    }

    this.setData({
      staffIdentity,
      pageState: 'loading',
      stateMessage: '',
      reviewMessage: '',
      reviewStateMap: {},
      listState: 'loading',
      detailListNotice: ''
    });

    try {
      const response = await listStaffAppointments();
      const appointments = normalizeAppointments(response.items || []);
      const summary = buildSummary(appointments);
      const statusLists = buildStatusLists(appointments);
      const calendarState = buildCalendarState(appointments, this.data.monthCursor, this.data.selectedDate);

      this.setData({
        appointments,
        summary,
        pendingAppointments: statusLists.pendingAppointments,
        approvedAppointments: statusLists.approvedAppointments,
        rejectedAppointments: statusLists.rejectedAppointments,
        historyAppointments: statusLists.historyAppointments,
        pageState: 'ready',
        stateMessage: appointments.length ? '' : '当前暂无门店预约记录，月历仍保持可查看状态。',
        ...calendarState
      });

      await this.loadDetailList(this.data.activeListFilter || 'all', {
        appointments,
        summary,
        historyAppointments: statusLists.historyAppointments
      });
    } catch (error) {
      this.setData({
        reviewStateMap: {},
        reviewMessage: '',
        pageState: error.isUnauthorized ? 'unauthorized' : 'error',
        stateMessage: formatPageErrorMessage(error, '店员预约列表加载失败，请稍后重试。'),
        ...getEmptyDashboardState(this.data.activeListFilter || 'all')
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
