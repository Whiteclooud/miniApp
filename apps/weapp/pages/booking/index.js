const { getAvailability, createAppointment } = require('../../services/appointment');
const { getErrorKind, getErrorMessage } = require('../../utils/request');
const { DEFAULT_DEVELOP_CUSTOMER_OPENID } = require('../../utils/customer');

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

function normalizeStringOption(value, index, prefix) {
  return {
    id: `${prefix}-${index}`,
    label: value,
    value
  };
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

function normalizeTimeSlotOption(item, index) {
  if (typeof item === 'string') {
    return normalizeStringOption(item, index, 'time-slot');
  }

  const value = item.timeSlot || item.value || item.label || item.name || '';
  return {
    id: item.id || `time-slot-${index}`,
    label: item.label || value,
    value
  };
}

function normalizeTimeSlots(items) {
  return (items || [])
    .map((item, index) => normalizeTimeSlotOption(item, index))
    .filter((item) => item.value);
}

function normalizeAvailability(data, requestedDate) {
  const source = data.item || data.data || data || {};
  const grouped = {};
  const groupedEntries = source.items || source.availability || source.dateSlots || source.dateTimeSlots || [];

  if (Array.isArray(groupedEntries) && groupedEntries.length) {
    groupedEntries.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }

      const dateValue = entry.date || entry.value || entry.label || requestedDate || '';
      if (!dateValue) {
        return;
      }

      grouped[dateValue] = normalizeTimeSlots(entry.timeSlots || entry.availableSlots || entry.slots || []);
      if (!grouped[dateValue].length && entry.timeSlot) {
        grouped[dateValue] = [normalizeTimeSlotOption(entry, index)];
      }
    });
  } else if (source.timeSlotsByDate && typeof source.timeSlotsByDate === 'object') {
    Object.keys(source.timeSlotsByDate).forEach((key) => {
      grouped[key] = normalizeTimeSlots(source.timeSlotsByDate[key]);
    });
  }

  let dateOptions = Object.keys(grouped).length
    ? Object.keys(grouped)
      .sort()
      .map((value, index) => normalizeDateOption({ value }, index))
    : (source.dateOptions || source.availableDates || source.dates || [])
      .map((item, index) => normalizeDateOption(item, index))
      .filter((item) => item.value);

  if (!dateOptions.length && requestedDate) {
    dateOptions = [normalizeDateOption({ value: requestedDate }, 0)];
  }

  const defaultTimeSlotOptions = normalizeTimeSlots(
    source.timeSlotOptions || source.availableSlots || source.timeSlots || []
  );

  const selectedDate = dateOptions.some((item) => item.value === requestedDate)
    ? requestedDate
    : (dateOptions[0] && dateOptions[0].value) || requestedDate || '';

  return {
    dateOptions,
    timeSlotOptionsByDate: grouped,
    defaultTimeSlotOptions,
    selectedDate
  };
}

function getTimeSlotOptionsForDate(availability, date) {
  const mapped = availability.timeSlotOptionsByDate[date];
  if (Array.isArray(mapped) && mapped.length) {
    return mapped;
  }

  return availability.defaultTimeSlotOptions || [];
}

function getIdentityMeta() {
  const app = getApp();
  const identity = app.getCustomerIdentity ? app.getCustomerIdentity() : app.globalData.customerIdentity;
  const isDefaultMock = identity.isDefaultMock || identity.openId === DEFAULT_DEVELOP_CUSTOMER_OPENID;

  return {
    openId: identity.openId,
    label: identity.label,
    canUse: identity.canUse,
    isMock: identity.isMock,
    isDefaultMock,
    isDevelopEnv: !!app.globalData.isDevelopEnv,
    sourceText: identity.canUse
      ? isDefaultMock
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
    dateOptions: [],
    dateIndex: 0,
    timeSlotOptions: [],
    timeSlotIndex: 0,
    availability: {
      dateOptions: [],
      timeSlotOptionsByDate: {},
      defaultTimeSlotOptions: [],
      selectedDate: ''
    },
    form: {
      customerName: '',
      phone: '',
      note: ''
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

  async onDateChange(event) {
    const dateIndex = Number(event.detail.value);
    const nextDate = (this.data.dateOptions[dateIndex] && this.data.dateOptions[dateIndex].value) || '';
    if (!nextDate) {
      return;
    }

    await this.loadAvailability(nextDate);
  },

  onTimeSlotChange(event) {
    this.setData({ timeSlotIndex: Number(event.detail.value) });
  },

  async loadPage() {
    const customerIdentity = getIdentityMeta();
    if (!customerIdentity.canUse) {
      this.setData({
        customerIdentity,
        pageState: 'unauthorized',
        stateMessage: customerIdentity.isDevelopEnv
          ? '未获取到顾客 OpenID。开发环境请先填写或生成模拟顾客 OpenID，再继续预约。'
          : '未获取到顾客 OpenID，当前环境不能提交预约。'
      });
      return;
    }

    const selectedDate =
      (this.data.dateOptions[this.data.dateIndex] && this.data.dateOptions[this.data.dateIndex].value) ||
      this.data.availability.selectedDate ||
      getTodayDateValue();

    await this.loadAvailability(selectedDate);
  },

  async loadAvailability(requestedDate) {
    const customerIdentity = getIdentityMeta();
    if (!customerIdentity.canUse) {
      this.setData({
        customerIdentity,
        pageState: 'unauthorized',
        stateMessage: customerIdentity.isDevelopEnv
          ? '未获取到顾客 OpenID。开发环境请先填写或生成模拟顾客 OpenID，再继续预约。'
          : '未获取到顾客 OpenID，当前环境不能提交预约。'
      });
      return;
    }

    const date = requestedDate || getTodayDateValue();
    this.setData({
      customerIdentity,
      pageState: 'loading',
      stateMessage: '',
      submitMessage: ''
    });

    try {
      const availability = normalizeAvailability(await getAvailability(date), date);
      const dateOptions = availability.dateOptions;
      const selectedDate = availability.selectedDate;
      const timeSlotOptions = getTimeSlotOptionsForDate(availability, selectedDate);
      const selectedIndex = Math.max(dateOptions.findIndex((item) => item.value === selectedDate), 0);

      let pageState = 'ready';
      let stateMessage = '';
      if (!dateOptions.length) {
        pageState = 'empty';
        stateMessage = 'availability 接口已返回，但当前没有可约日期。';
      } else if (!timeSlotOptions.length) {
        pageState = 'empty';
        stateMessage = 'availability 接口已返回，但当前日期暂无可约时段，请联系店员确认排期。';
      }

      this.setData({
        availability,
        dateOptions,
        dateIndex: selectedIndex,
        timeSlotOptions,
        timeSlotIndex: 0,
        pageState,
        stateMessage
      });
    } catch (error) {
      this.setData({
        pageState: error.isUnauthorized ? 'unauthorized' : 'error',
        stateMessage: formatPageErrorMessage(error, '预约页加载失败，请确认 availability 接口是否可用。')
      });
    }
  },

  async submit() {
    const {
      pageState,
      dateOptions,
      dateIndex,
      timeSlotOptions,
      timeSlotIndex,
      form,
      customerIdentity
    } = this.data;

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

    const dateOption = dateOptions[dateIndex];
    const timeSlotOption = timeSlotOptions[timeSlotIndex];
    const customerName = (form.customerName || '').trim();
    const phone = (form.phone || '').trim();
    const note = (form.note || '').trim();

    if (phone && !/^1\d{10}$/.test(phone)) {
      this.setData({
        submitMessage: '手机号仅用于联系；如需填写，请输入正确的 11 位手机号。'
      });
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }

    if (!dateOption || !timeSlotOption) {
      this.setData({
        submitMessage: '预约信息不完整，请确认预约日期和时间段。'
      });
      wx.showToast({ title: '预约信息不完整', icon: 'none' });
      return;
    }

    this.setData({
      submitState: 'submitting',
      submitMessage: ''
    });

    try {
      await createAppointment({
        appointmentDate: dateOption.value,
        timeSlot: timeSlotOption.value,
        customerName,
        phone,
        note
      });

      wx.showToast({ title: '预约已提交', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({
          url: '/pages/my-bookings/index'
        });
      }, 700);
    } catch (error) {
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
      this.setData({
        submitState: 'idle'
      });
    }
  }
});
