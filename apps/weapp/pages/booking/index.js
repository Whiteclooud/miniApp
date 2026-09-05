const {
  getAvailability,
  createAppointment,
  uploadCustomerReferenceImages,
  deleteCustomerReferenceImage
} = require('../../services/appointment');
const { getErrorKind, getErrorMessage } = require('../../utils/request');
const { DEFAULT_DEVELOP_CUSTOMER_OPENID } = require('../../utils/customer');
const { isCustomerReferenceImageUrl } = require('../../utils/reference-images');
const {
  hasCustomerAccess,
  isLoginRequiredError,
  promptForLogin
} = require('../../utils/login-guard');

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const CALENDAR_LEGEND = [
  { key: 'AVAILABLE', label: '可约', status: 'active' },
  { key: 'SLOT_OCCUPIED', label: '已满', status: 'disabled' },
  { key: 'DATE_CLOSED', label: '休息', status: 'disabled' },
  { key: 'DATE_OUT_OF_RANGE', label: '超窗', status: 'disabled' }
];
const MAX_REFERENCE_IMAGE_COUNT = 6;

function decodeRouteOption(value) {
  try {
    return decodeURIComponent(value || '');
  } catch (_error) {
    return `${value || ''}`;
  }
}

function chooseReferenceImagePaths(count) {
  return new Promise((resolve, reject) => {
    if (typeof wx.chooseMedia === 'function') {
      wx.chooseMedia({
        count,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (result) => resolve(
          (result.tempFiles || []).map((item) => item.tempFilePath).filter(Boolean)
        ),
        fail: reject
      });
      return;
    }

    wx.chooseImage({
      count,
      sourceType: ['album', 'camera'],
      success: (result) => resolve(result.tempFilePaths || []),
      fail: reject
    });
  });
}

function getUploadedReferenceImageUrls(items = []) {
  return [...new Set((items || [])
    .map((item) => item && item.url)
    .filter((url) => typeof url === 'string' && url.trim()))];
}

async function cleanupUploadedReferenceImages(items = []) {
  const imageUrls = getUploadedReferenceImageUrls(items)
    .filter(isCustomerReferenceImageUrl);

  await Promise.all(imageUrls.map((imageUrl) => (
    deleteCustomerReferenceImage(imageUrl).catch(() => null)
  )));
}

function padNumber(value) {
  return `${value}`.padStart(2, '0');
}

function getWeekdayText(day) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][day] || '';
}

function formatDateValue(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function getTodayDateValue() {
  return formatDateValue(new Date());
}

function formatDateLabel(value) {
  if (!value) {
    return '未设置日期';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDay = Math.round((current - start) / (24 * 60 * 60 * 1000));
  const prefix = diffDay === 0 ? '今天' : diffDay === 1 ? '明天' : getWeekdayText(date.getDay());
  return `${prefix} ${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function normalizeText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function normalizeDateOption(item, index) {
  if (typeof item === 'string') {
    return {
      id: `date-${index}`,
      label: formatDateLabel(item),
      value: item
    };
  }

  const value = item.date || item.value || item.label || '';
  return {
    id: item.id || `date-${index}`,
    label: item.label || formatDateLabel(value),
    value
  };
}

function normalizeTimeSlotStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'active' || normalized === 'disabled') {
    return normalized;
  }
  return '';
}

function normalizeTimeSlotOption(item, index) {
  if (typeof item === 'string') {
    return {
      id: `time-slot-${index}`,
      label: item,
      value: item,
      status: 'active',
      reasonCode: '',
      reasonText: ''
    };
  }

  const value = normalizeText(item.timeSlot || item.value || item.label || item.name);
  const reasonCode = normalizeText(item.reasonCode || item.reason_code || item.code);
  const reasonText = normalizeText(item.reasonText || item.reason_text || item.reason || item.disabledReason);
  const explicitStatus = normalizeTimeSlotStatus(item.status);
  const status = explicitStatus || ((item.disabled === true || item.available === false || reasonCode || reasonText) ? 'disabled' : 'active');

  return {
    id: item.id || `time-slot-${index}`,
    label: normalizeText(item.label || item.timeLabel, value) || value,
    value,
    status,
    reasonCode,
    reasonText
  };
}

function normalizeTimeSlots(items) {
  return (items || [])
    .map((item, index) => normalizeTimeSlotOption(item, index))
    .filter((item) => item.value);
}

function normalizeCalendarDay(item, index) {
  if (typeof item === 'string') {
    return {
      id: `calendar-day-${index}`,
      date: item,
      status: 'active',
      reasonCode: 'AVAILABLE',
      reasonText: '可预约'
    };
  }

  const date = normalizeText(item.date || item.value || item.label);
  const reasonCode = normalizeText(item.reasonCode || item.reason_code || item.code || 'AVAILABLE');
  const reasonText = normalizeText(item.reasonText || item.reason_text || item.reason || '');
  const explicitStatus = normalizeTimeSlotStatus(item.status);
  const status = explicitStatus || ((reasonCode && reasonCode !== 'AVAILABLE') ? 'disabled' : 'active');

  return {
    id: item.id || `calendar-day-${index}`,
    date,
    status,
    reasonCode: reasonCode || (status === 'active' ? 'AVAILABLE' : 'DATE_OUT_OF_RANGE'),
    reasonText: reasonText || (status === 'active' ? '可预约' : '当前日期不可预约')
  };
}

function formatMonthLabel(dateText) {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    return '预约日历';
  }
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
}

function getDateNumber(dateText) {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  return `${date.getDate()}`;
}

function buildCalendarWeeks(calendarDays, selectedDate) {
  if (!calendarDays.length) {
    return [];
  }

  const sortedDays = [...calendarDays].sort((left, right) => `${left.date}`.localeCompare(`${right.date}`));
  const firstDate = new Date(sortedDays[0].date);
  const lastDate = new Date(sortedDays[sortedDays.length - 1].date);
  if (Number.isNaN(firstDate.getTime()) || Number.isNaN(lastDate.getTime())) {
    return [];
  }

  const dayMap = sortedDays.reduce((result, item) => {
    result[item.date] = item;
    return result;
  }, {});

  const startDate = new Date(firstDate);
  startDate.setDate(1 - firstDate.getDay());
  const endDate = new Date(lastDate);
  endDate.setDate(lastDate.getDate() + (6 - lastDate.getDay()));
  const today = getTodayDateValue();
  const weeks = [];
  let currentWeek = [];

  for (let cursor = new Date(startDate); cursor <= endDate; cursor.setDate(cursor.getDate() + 1)) {
    const key = formatDateValue(cursor);
    const source = dayMap[key];
    const isCurrentMonth = cursor.getMonth() === firstDate.getMonth();
    currentWeek.push({
      key,
      date: key,
      dayNumber: getDateNumber(key),
      isCurrentMonth,
      isToday: key === today,
      isSelected: key === selectedDate,
      status: source ? source.status : 'disabled',
      reasonCode: source ? source.reasonCode : 'DATE_OUT_OF_RANGE',
      reasonText: source ? source.reasonText : '超出开放窗口',
      isDisabled: !source || source.status !== 'active',
      canTap: Boolean(source)
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  return weeks;
}

function normalizeAvailability(data, requestedDate) {
  const source = data.item || data.data || data || {};
  const responseSelectedDate = normalizeText(
    source.selectedDate || source.selected_date || source.currentDate || source.current_date
  );
  const dateOptions = (source.dateOptions || source.availableDates || source.dates || []).map(normalizeDateOption).filter((item) => item.value);
  const selectedDate = dateOptions.some((item) => item.value === requestedDate)
    ? requestedDate
    : responseSelectedDate || (dateOptions[0] && dateOptions[0].value) || requestedDate || '';
  const timeSlotOptions = normalizeTimeSlots(source.items || source.timeSlotOptions || source.availableSlots || source.timeSlots || []);
  const calendarDays = (source.calendarDays || source.calendar_days || dateOptions.map((item) => ({
    date: item.value,
    status: item.value === selectedDate ? 'active' : 'disabled',
    reasonCode: item.value === selectedDate ? 'AVAILABLE' : 'DATE_OUT_OF_RANGE',
    reasonText: item.value === selectedDate ? '可预约' : '超出开放窗口'
  }))).map(normalizeCalendarDay).filter((item) => item.date);
  const selectedCalendarDay = calendarDays.find((item) => item.date === selectedDate) || null;

  return {
    dateOptions,
    calendarDays,
    selectedDate,
    selectedCalendarDay,
    timeSlotOptions,
    monthLabel: selectedDate ? formatMonthLabel(selectedDate) : '预约日历',
    calendarWeeks: buildCalendarWeeks(calendarDays, selectedDate)
  };
}

function getSelectedTimeSlotOption(timeSlotOptions, selectedTimeSlotValue) {
  return (timeSlotOptions || []).find((item) => item.value === selectedTimeSlotValue) || null;
}

function getFirstActiveTimeSlot(timeSlotOptions) {
  return (timeSlotOptions || []).find((item) => item.status === 'active') || null;
}

function resolveSelectedTimeSlotValue(timeSlotOptions, currentValue) {
  const currentOption = getSelectedTimeSlotOption(timeSlotOptions, currentValue);
  if (currentOption && currentOption.status === 'active') {
    return currentOption.value;
  }

  const firstActiveOption = getFirstActiveTimeSlot(timeSlotOptions);
  return firstActiveOption ? firstActiveOption.value : '';
}

function getTimeSlotReasonText(timeSlotOption) {
  if (!timeSlotOption) {
    return '';
  }

  return timeSlotOption.reasonText || timeSlotOption.reasonCode || '';
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
        ? '当前使用微信顾客 Bearer 会话；提交预约时会按当前登录身份校验。'
        : isDefaultMock
        ? '当前使用开发环境默认顾客 OpenID（customer-openid-demo）；提交预约时会自动通过 X-Customer-OpenId 传递。'
        : identity.isMock
          ? '当前为开发环境自定义顾客 OpenID；提交预约时会自动通过 X-Customer-OpenId 传递。'
          : '当前为顾客预约身份；提交预约时会自动通过 X-Customer-OpenId 传递。'
      : app.globalData.isDevelopEnv
        ? '未设置顾客 OpenID。开发环境请填写或生成模拟 OpenID，避免用手机号充当身份键。'
        : '未获取到顾客 OpenID，当前无法提交预约。'
  };
}

function formatPageErrorMessage(error, fallback) {
  const kind = getErrorKind(error);
  if (kind === 'network') {
    return '网络异常，预约页数据加载失败。请确认本地服务已启动并允许开发者工具访问。';
  }

  if (kind === 'unauthorized') {
    return getErrorMessage(error, fallback || '当前身份无权访问预约数据。');
  }

  return getErrorMessage(error, fallback || '预约页加载失败，请稍后重试。');
}

function formatSubmitErrorMessage(error) {
  const kind = getErrorKind(error);
  if (kind === 'network') {
    return '网络异常，本次预约没有提交成功，请检查服务端或网络连接后重试。';
  }

  if (kind === 'conflict') {
    return getErrorMessage(error, '当前日期或时段已被占用，请更换预约时间后再提交。');
  }

  if (kind === 'bad-request') {
    return getErrorMessage(error, '提交失败，请检查预约日期、时间段或联系信息格式是否正确。');
  }

  return getErrorMessage(error, '提交失败，请稍后重试。');
}

Page({
  data: {
    pageState: 'loading',
    stateMessage: '',
    submitMessage: '',
    submitState: 'idle',
    submitResult: null,
    sourceGalleryTitle: '',
    sourceGalleryId: '',
    referenceImageUrls: [],
    referenceImageState: 'idle',
    referenceImageMessage: '',
    maxReferenceImageCount: MAX_REFERENCE_IMAGE_COUNT,
    timeSlotStateMessage: '',
    availabilityNoticeText: '',
    customerIdentity: {
      openId: '',
      label: '未设置顾客 OpenID',
      sourceText: '',
      canUse: false,
      isMock: false,
      isDefaultMock: false,
      isDevelopEnv: false
    },
    customerOpenIdInput: '',
    weekLabels: WEEK_LABELS,
    calendarLegend: CALENDAR_LEGEND,
    monthLabel: '预约日历',
    calendarWeeks: [],
    selectedCalendarDay: null,
    timeSlotOptions: [],
    selectedTimeSlotValue: '',
    availability: {
      dateOptions: [],
      calendarDays: [],
      selectedDate: '',
      timeSlotOptions: []
    },
    form: {
      customerName: '',
      phone: '',
      note: ''
    }
  },

  onLoad(options = {}) {
    const galleryId = decodeRouteOption(options.galleryId);
    const galleryTitle = decodeRouteOption(options.galleryTitle);
    const referenceImageUrl = decodeRouteOption(options.referenceImageUrl);
    if (galleryId || galleryTitle || referenceImageUrl) {
      this.setData({
        sourceGalleryId: galleryId,
        sourceGalleryTitle: galleryTitle,
        referenceImageUrls: referenceImageUrl ? [referenceImageUrl] : []
      });
    }
  },

  onShow() {
    this.refreshCustomerIdentity();
    this.loadPage();
  },

  async onPullDownRefresh() {
    this.refreshCustomerIdentity();
    await this.loadPage();
    wx.stopPullDownRefresh();
  },

  refreshCustomerIdentity() {
    const customerIdentity = getIdentityMeta();
    this.setData({
      customerIdentity,
      customerOpenIdInput: customerIdentity.openId || this.data.customerOpenIdInput || ''
    });
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
    this.loadPage();
    wx.showToast({ title: '顾客 OpenID 已保存', icon: 'success' });
  },

  generateCustomerOpenId() {
    getApp().createMockCustomerOpenId();
    this.refreshCustomerIdentity();
    this.loadPage();
    wx.showToast({ title: '已生成模拟 OpenID', icon: 'success' });
  },

  clearCustomerOpenId() {
    getApp().clearCustomerOpenId();
    this.setData({
      customerOpenIdInput: ''
    });
    this.refreshCustomerIdentity();
    this.loadPage();
    wx.showToast({ title: '已清空顾客 OpenID', icon: 'none' });
  },

  onInput(event) {
    const { field } = event.currentTarget.dataset;
    const { value } = event.detail;
    this.setData({
      [`form.${field}`]: value
    });
  },

  async addReferenceImages() {
    if (!hasCustomerAccess()) {
      const canContinue = await promptForLogin({ content: '上传预约参考图需要使用微信登录。' });
      if (!canContinue) {
        return;
      }
    }
    const remainingCount = MAX_REFERENCE_IMAGE_COUNT - this.data.referenceImageUrls.length;
    if (
      remainingCount <= 0 ||
      this.data.submitState !== 'idle' ||
      this.data.referenceImageState !== 'idle'
    ) {
      if (remainingCount <= 0) {
        wx.showToast({ title: `最多上传 ${MAX_REFERENCE_IMAGE_COUNT} 张`, icon: 'none' });
      }
      return;
    }

    this.setData({
      referenceImageState: 'choosing',
      referenceImageMessage: ''
    });

    try {
      const filePaths = await chooseReferenceImagePaths(remainingCount);
      if (this.data.submitState !== 'idle') {
        if (this.data.referenceImageState === 'choosing') {
          this.setData({ referenceImageState: 'idle' });
        }
        return;
      }
      if (this.data.referenceImageState !== 'choosing') {
        return;
      }

      if (!filePaths.length) {
        this.setData({ referenceImageState: 'idle' });
        return;
      }

      this.setData({
        referenceImageState: 'uploading',
        referenceImageMessage: ''
      });
      const response = await uploadCustomerReferenceImages(filePaths);
      const uploadedUrls = getUploadedReferenceImageUrls(response.items);
      const referenceImageUrls = [...new Set([
        ...this.data.referenceImageUrls,
        ...uploadedUrls
      ])].slice(0, MAX_REFERENCE_IMAGE_COUNT);

      this.setData({
        referenceImageUrls,
        referenceImageState: 'idle',
        referenceImageMessage: ''
      });
    } catch (error) {
      const isCancelled = error && /cancel/i.test(`${error.errMsg || error.message || ''}`);
      await cleanupUploadedReferenceImages(error && error.uploadedItems);
      this.setData({
        referenceImageState: 'idle',
        referenceImageMessage: isCancelled ? '' : getErrorMessage(error, '参考图上传失败，请重试。')
      });
      if (!isCancelled) {
        wx.showToast({ title: '参考图上传失败', icon: 'none' });
      }
    }
  },

  async removeReferenceImage(event) {
    if (!hasCustomerAccess()) {
      const canContinue = await promptForLogin({ content: '管理预约参考图需要使用微信登录。' });
      if (!canContinue) {
        return;
      }
    }
    if (
      this.data.submitState !== 'idle' ||
      this.data.referenceImageState !== 'idle'
    ) {
      return;
    }

    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.referenceImageUrls.length) {
      return;
    }

    const imageUrl = this.data.referenceImageUrls[index];
    if (!isCustomerReferenceImageUrl(imageUrl)) {
      this.setData({
        referenceImageUrls: this.data.referenceImageUrls.filter(
          (_url, itemIndex) => itemIndex !== index
        ),
        referenceImageMessage: ''
      });
      return;
    }

    this.setData({
      referenceImageState: 'deleting',
      referenceImageMessage: ''
    });

    try {
      await deleteCustomerReferenceImage(imageUrl);
      this.setData({
        referenceImageUrls: this.data.referenceImageUrls.filter(
          (_url, itemIndex) => itemIndex !== index
        ),
        referenceImageState: 'idle',
        referenceImageMessage: ''
      });
    } catch (error) {
      if (error && (error.statusCode === 404 || error.code === 'CUSTOMER_UPLOAD_NOT_FOUND')) {
        this.setData({
          referenceImageUrls: this.data.referenceImageUrls.filter(
            (_url, itemIndex) => itemIndex !== index
          ),
          referenceImageState: 'idle',
          referenceImageMessage: ''
        });
        return;
      }

      const detail = getErrorMessage(error, '请稍后重试。');
      this.setData({
        referenceImageState: 'idle',
        referenceImageMessage: `参考图删除失败，图片已保留：${detail}`
      });
      wx.showToast({ title: '删除失败，图片已保留', icon: 'none' });
    }
  },

  previewReferenceImage(event) {
    const current = event.currentTarget.dataset.url;
    if (!current || !this.data.referenceImageUrls.length) {
      return;
    }

    wx.previewImage({
      current,
      urls: this.data.referenceImageUrls
    });
  },

  goMyBookings() {
    if (!hasCustomerAccess()) {
      promptForLogin({
        redirect: '/pages/my-bookings/index',
        content: '查看我的预约需要使用微信登录。'
      });
      return;
    }
    wx.redirectTo({
      url: '/pages/my-bookings/index?created=1'
    });
  },

  bookAgain() {
    this.setData({
      submitState: 'idle',
      submitMessage: '',
      submitResult: null
    });
    this.loadPage();
  },

  async onCalendarDayTap(event) {
    const { date, canTap } = event.currentTarget.dataset;
    if (!date || canTap === false || canTap === 'false') {
      return;
    }

    await this.loadAvailability(date);
  },

  async changeMonth(event) {
    const { delta } = event.currentTarget.dataset;
    const currentDateText = this.data.availability.selectedDate || getTodayDateValue();
    const currentDate = new Date(currentDateText);
    if (Number.isNaN(currentDate.getTime())) {
      return;
    }

    const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + Number(delta || 0), 1);
    await this.loadAvailability(formatDateValue(targetDate));
  },

  resetToCurrentMonth() {
    this.loadAvailability(getTodayDateValue());
  },

  onTimeSlotTap(event) {
    const { value, status, reasonText, reasonCode } = event.currentTarget.dataset;
    if (!value) {
      return;
    }

    if (status !== 'active') {
      wx.showToast({
        title: reasonText || reasonCode || '当前时段不可预约',
        icon: 'none'
      });
      return;
    }

    this.setData({
      selectedTimeSlotValue: value,
      submitMessage: ''
    });
  },

  async loadPage() {
    const customerIdentity = getIdentityMeta();
    this.setData({ customerIdentity });
    const selectedDate = this.data.availability.selectedDate || getTodayDateValue();
    await this.loadAvailability(selectedDate);
  },

  async loadAvailability(requestedDate) {
    const customerIdentity = getIdentityMeta();
    const date = requestedDate || getTodayDateValue();
    this.setData({
      customerIdentity,
      pageState: 'loading',
      stateMessage: '',
      submitMessage: '',
      timeSlotStateMessage: '',
      availabilityNoticeText: ''
    });

    try {
      const previousDate = this.data.availability.selectedDate;
      const previousSelectedTimeSlotValue = this.data.selectedTimeSlotValue;
      const availability = normalizeAvailability(await getAvailability(date), date);
      const timeSlotOptions = availability.timeSlotOptions || [];
      const selectedTimeSlotValue = resolveSelectedTimeSlotValue(
        timeSlotOptions,
        availability.selectedDate === previousDate ? previousSelectedTimeSlotValue : ''
      );
      const hasActiveTimeSlots = timeSlotOptions.some((item) => item.status === 'active');

      let pageState = 'ready';
      let stateMessage = '';
      let timeSlotStateMessage = '';
      if (!availability.calendarDays.length) {
        pageState = 'empty';
        stateMessage = 'availability 接口已返回，但当前没有可展示的月历日期。';
      } else if (!timeSlotOptions.length) {
        pageState = 'empty';
        stateMessage = '当前日期暂无可展示时段，请联系店员确认排期。';
      } else if (!hasActiveTimeSlots) {
        timeSlotStateMessage = (availability.selectedCalendarDay && availability.selectedCalendarDay.reasonText)
          ? `当前日期不可直接预约：${availability.selectedCalendarDay.reasonText}。你仍可查看各时段禁用原因。`
          : '当前日期暂无可直接提交的可预约时段；灰色卡片已展示不可预约原因，请改选日期或联系门店确认排期。';
      }

      this.setData({
        availability,
        monthLabel: availability.monthLabel,
        calendarWeeks: availability.calendarWeeks,
        selectedCalendarDay: availability.selectedCalendarDay,
        timeSlotOptions,
        selectedTimeSlotValue,
        pageState,
        stateMessage,
        timeSlotStateMessage,
        availabilityNoticeText: availability.selectedCalendarDay && availability.selectedCalendarDay.reasonCode === 'DATE_OUT_OF_RANGE'
          ? '当前查看的是超出开放窗口的日期，月历仍保留状态展示，便于理解哪些日期暂不可约。'
          : ''
      });
    } catch (error) {
      this.setData({
        pageState: error.isUnauthorized ? 'unauthorized' : 'error',
        stateMessage: formatPageErrorMessage(error, '预约页加载失败，请确认 availability 接口是否可用。'),
        timeSlotStateMessage: '',
        availabilityNoticeText: '',
        selectedTimeSlotValue: ''
      });
    }
  },

  async submit() {
    const {
      pageState,
      availability,
      timeSlotOptions,
      selectedTimeSlotValue,
      form,
      referenceImageUrls,
      referenceImageState,
      submitState,
      customerIdentity
    } = this.data;

    if (referenceImageState !== 'idle') {
      this.setData({
        submitMessage: '参考图正在处理，请等待完成后再提交。'
      });
      wx.showToast({ title: '参考图正在处理', icon: 'none' });
      return;
    }

    if (submitState === 'submitting') {
      return;
    }

    if (!hasCustomerAccess()) {
      const canContinue = await promptForLogin({ content: '提交预约需要使用微信登录。' });
      if (!canContinue) {
        return;
      }
    }

    if (!customerIdentity.canUse) {
      this.setData({
        pageState: 'unauthorized',
        stateMessage: '缺少顾客 OpenID，当前不能提交预约。'
      });
      wx.showToast({ title: '缺少顾客 OpenID', icon: 'none' });
      return;
    }

    if (pageState !== 'ready') {
      wx.showToast({ title: '当前不可提交预约', icon: 'none' });
      return;
    }

    const timeSlotOption = getSelectedTimeSlotOption(timeSlotOptions, selectedTimeSlotValue);
    const customerName = (form.customerName || '').trim();
    const phone = (form.phone || '').trim();
    const note = (form.note || '').trim();

    if (customerName.length > 30) {
      this.setData({
        submitMessage: '姓名建议控制在 30 个字以内，方便门店快速识别。'
      });
      wx.showToast({ title: '姓名过长', icon: 'none' });
      return;
    }

    if (phone && !/^1\d{10}$/.test(phone)) {
      this.setData({
        submitMessage: '手机号仅用于联系；如需填写，请输入正确的 11 位手机号。'
      });
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }

    if (note.length > 200) {
      this.setData({
        submitMessage: '备注建议控制在 200 个字以内。'
      });
      wx.showToast({ title: '备注过长', icon: 'none' });
      return;
    }

    if (!availability.selectedDate || !timeSlotOption || timeSlotOption.status !== 'active') {
      this.setData({
        submitMessage: getTimeSlotReasonText(timeSlotOption) || '当前没有可提交的预约时段，请改选其他日期或时间。'
      });
      wx.showToast({ title: '请选择可预约时段', icon: 'none' });
      return;
    }

    this.setData({
      submitState: 'submitting',
      submitMessage: ''
    });

    try {
      const response = await createAppointment({
        appointmentDate: availability.selectedDate,
        timeSlot: timeSlotOption.value,
        customerName,
        phone,
        note,
        referenceImageUrls
      });

      wx.showToast({ title: '预约已提交', icon: 'success' });
      this.setData({
        submitState: 'success',
        submitResult: response.item || {
          date: availability.selectedDate,
          timeSlot: timeSlotOption.value,
          status: 'pending'
        }
      });
    } catch (error) {
      if (isLoginRequiredError(error)) {
        promptForLogin({ content: '登录状态已失效，请重新登录后提交预约。' });
        return;
      }
      if (error.isUnauthorized) {
        this.setData({
          pageState: 'unauthorized',
          stateMessage: formatPageErrorMessage(error, '未获取到顾客身份，暂时不能提交预约。')
        });
        return;
      }

      this.setData({
        submitMessage: formatSubmitErrorMessage(error)
      });
      wx.showToast({
        title: getErrorKind(error) === 'conflict' ? '预约时段冲突' : '提交失败',
        icon: 'none'
      });
    } finally {
      if (this.data.submitState !== 'success') {
        this.setData({
          submitState: 'idle'
        });
      }
    }
  }
});
