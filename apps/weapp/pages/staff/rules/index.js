const { listStaffRules, updateStaffRules } = require('../../../services/appointment');
const {
  ensureStaffIdentity,
  setStaffOpenId,
  clearStaffOpenId,
  createMockStaffOpenId
} = require('../../../utils/staff');
const { getErrorKind, getErrorMessage } = require('../../../utils/request');
const { isDevelopEnv } = require('../../../utils/customer');

const ADVANCE_OPEN_DAY_OPTIONS = [0, 1, 3, 5, 7, 14, 21, 30];
const WEEKDAY_OPTIONS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 0, label: '周日' }
];
const SLOT_PRESET_OPTIONS = [
  { label: '09:00 - 10:00', start: '09:00', end: '10:00' },
  { label: '10:30 - 11:30', start: '10:30', end: '11:30' },
  { label: '13:00 - 14:00', start: '13:00', end: '14:00' },
  { label: '14:30 - 15:30', start: '14:30', end: '15:30' },
  { label: '16:00 - 17:00', start: '16:00', end: '17:00' },
  { label: '18:30 - 19:30', start: '18:30', end: '19:30' }
];

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => `${item}`.trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function normalizeAdvanceOpenDays(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return '';
  }

  return `${Math.floor(numberValue)}`;
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

function compareText(a, b) {
  return `${a}`.localeCompare(`${b}`);
}

function uniqueSortedDates(dates) {
  return [...new Set(normalizeStringList(dates).filter(isDateText))].sort(compareText);
}

function uniqueSortedSlots(slots) {
  return [...new Set(normalizeStringList(slots).filter(isDailySlotText))].sort(compareSlots);
}

function normalizeWeeklyOpenDays(value) {
  const source = Array.isArray(value) ? value : WEEKDAY_OPTIONS.map((item) => item.value);
  const days = source
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
  return [...new Set(days)].sort((left, right) => left - right);
}

function normalizeDateSlotOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.keys(value).sort(compareText).reduce((result, dateText) => {
    if (isDateText(dateText)) {
      result[dateText] = uniqueSortedSlots(value[dateText]);
    }
    return result;
  }, {});
}

function getDefaultForm() {
  return {
    advanceOpenDays: '7',
    closedDates: [],
    dailySlots: ['10:00-11:00'],
    weeklyOpenDays: WEEKDAY_OPTIONS.map((item) => item.value),
    sameDayCutoffTime: '',
    minAdvanceHours: '0',
    dateSlotOverrides: {}
  };
}

function normalizeRules(response) {
  const source = response.item || response.rules || response.data || response || {};
  const form = {
    advanceOpenDays: normalizeAdvanceOpenDays(source.advanceOpenDays),
    closedDates: uniqueSortedDates(source.closedDates),
    dailySlots: uniqueSortedSlots(source.dailySlots),
    weeklyOpenDays: normalizeWeeklyOpenDays(source.weeklyOpenDays),
    sameDayCutoffTime: source.sameDayCutoffTime || '',
    minAdvanceHours: normalizeAdvanceOpenDays(source.minAdvanceHours),
    dateSlotOverrides: normalizeDateSlotOverrides(source.dateSlotOverrides)
  };

  const fallbackForm = getDefaultForm();

  return {
    form: {
      advanceOpenDays: form.advanceOpenDays === '' ? fallbackForm.advanceOpenDays : form.advanceOpenDays,
      closedDates: form.closedDates,
      dailySlots: form.dailySlots.length ? form.dailySlots : fallbackForm.dailySlots,
      weeklyOpenDays: form.weeklyOpenDays.length ? form.weeklyOpenDays : fallbackForm.weeklyOpenDays,
      sameDayCutoffTime: form.sameDayCutoffTime,
      minAdvanceHours: form.minAdvanceHours === '' ? fallbackForm.minAdvanceHours : form.minAdvanceHours,
      dateSlotOverrides: form.dateSlotOverrides
    },
    updatedAt: source.updatedAt || response.updatedAt || ''
  };
}

function hasRulesContent(rules) {
  return Boolean(
    rules.form.advanceOpenDays !== '' ||
    rules.form.closedDates.length ||
    rules.form.dailySlots.length
  );
}

function buildSubmitPayload(form) {
  return {
    advanceOpenDays: Number(form.advanceOpenDays),
    dailySlots: [...form.dailySlots],
    closedDates: [...form.closedDates],
    weeklyOpenDays: normalizeWeeklyOpenDays(form.weeklyOpenDays),
    sameDayCutoffTime: form.sameDayCutoffTime || '',
    minAdvanceHours: Number(form.minAdvanceHours || 0),
    dateSlotOverrides: normalizeDateSlotOverrides(form.dateSlotOverrides)
  };
}

function getStaffIdentityMeta() {
  const identity = ensureStaffIdentity();
  const app = getApp();
  const develop = isDevelopEnv() && !!(app && app.globalData && app.globalData.allowHeaderAuthFallback);
  return {
    openId: identity.openId,
    label: identity.label,
    canUse: identity.canUse,
    isMock: identity.isMock,
    isSession: identity.isSession,
    isDevelopEnv: develop,
    sourceText: identity.canUse
      ? identity.isSession
        ? '当前使用微信店员 Bearer 会话；店员接口会按当前登录身份校验。'
        : identity.isMock
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
    return '网络异常，店员规则页暂时加载失败。请确认本地服务已启动并允许开发者工具访问。';
  }

  if (kind === 'unauthorized') {
    return getErrorMessage(error, fallback || '当前身份无权查看店员规则。');
  }

  return getErrorMessage(error, fallback || '店员规则页加载失败，请稍后重试。');
}

function formatSubmitErrorMessage(error) {
  const kind = getErrorKind(error);
  if (kind === 'network') {
    return '网络异常，本次规则保存没有成功，请检查服务端或网络连接后重试。';
  }

  if (kind === 'bad-request') {
    return getErrorMessage(error, '规则提交失败，请检查提前开放天数、每日时段与闭店日期格式是否正确。');
  }

  if (kind === 'unauthorized') {
    return getErrorMessage(error, '当前身份无权提交店员规则。');
  }

  return getErrorMessage(error, '规则提交失败，请稍后重试。');
}

function isDateText(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isDailySlotText(value) {
  return /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(value);
}

function timeTextToMinutes(text) {
  const [hour, minute] = `${text}`.split(':').map((item) => Number(item));
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }
  return hour * 60 + minute;
}

function compareSlots(a, b) {
  const startA = timeTextToMinutes(`${a}`.split('-')[0]);
  const startB = timeTextToMinutes(`${b}`.split('-')[0]);
  if (startA === null || startB === null) {
    return compareText(a, b);
  }
  return startA - startB;
}

function hasSlotOverlap(slots) {
  const parsed = uniqueSortedSlots(slots).map((slot) => {
    const [startText, endText] = slot.split('-');
    return {
      slot,
      start: timeTextToMinutes(startText),
      end: timeTextToMinutes(endText)
    };
  });

  for (let index = 0; index < parsed.length - 1; index += 1) {
    const current = parsed[index];
    const next = parsed[index + 1];
    if (current.end > next.start) {
      return true;
    }
  }

  return false;
}

function buildAdvanceOptionItems(selectedValue) {
  return ADVANCE_OPEN_DAY_OPTIONS.map((value) => ({
    value: `${value}`,
    label: `${value} 天`,
    active: `${value}` === `${selectedValue}`
  }));
}

function buildPresetItems(form) {
  return SLOT_PRESET_OPTIONS.map((item) => ({
    ...item,
    slot: `${item.start}-${item.end}`,
    active: form.dailySlots.includes(`${item.start}-${item.end}`)
  }));
}

function buildRuleSummary(form) {
  const advanceText = form.advanceOpenDays === '' ? '未设置' : `提前 ${form.advanceOpenDays} 天开放`;
  const closedText = form.closedDates.length ? `已设 ${form.closedDates.length} 个闭店日期` : '当前未设置闭店日期';
  const slotText = form.dailySlots.length ? `共 ${form.dailySlots.length} 个每日时段` : '当前未设置时段';
  const weeklyText = `每周营业 ${normalizeWeeklyOpenDays(form.weeklyOpenDays).length} 天`;
  const cutoffText = form.sameDayCutoffTime ? `当天 ${form.sameDayCutoffTime} 后不可约` : '未设置当天截止';
  const minAdvanceText = Number(form.minAdvanceHours || 0) ? `需提前 ${form.minAdvanceHours} 小时` : '无提前小时限制';
  const overrideText = `${Object.keys(form.dateSlotOverrides || {}).length} 个特殊日期`;
  return [advanceText, closedText, slotText, weeklyText, cutoffText, minAdvanceText, overrideText];
}

function buildViewState(source) {
  const form = source && source.form ? source.form : getDefaultForm();
  const advanceValue = form.advanceOpenDays === '' ? '0' : `${form.advanceOpenDays}`;
  const advanceIndex = Math.max(0, ADVANCE_OPEN_DAY_OPTIONS.findIndex((value) => `${value}` === advanceValue));
  const weeklyOpenDays = normalizeWeeklyOpenDays(form.weeklyOpenDays);
  const dateSlotOverrides = normalizeDateSlotOverrides(form.dateSlotOverrides);
  const nextForm = {
    advanceOpenDays: advanceValue,
    closedDates: uniqueSortedDates(form.closedDates),
    dailySlots: uniqueSortedSlots(form.dailySlots),
    weeklyOpenDays,
    sameDayCutoffTime: form.sameDayCutoffTime || '',
    minAdvanceHours: normalizeAdvanceOpenDays(form.minAdvanceHours) || '0',
    dateSlotOverrides
  };
  return {
    form: nextForm,
    updatedAtText: formatTime(source && source.updatedAt),
    advanceOpenDaysIndex: advanceIndex,
    advanceOpenDayOptions: buildAdvanceOptionItems(advanceValue),
    weeklyOpenDayOptions: WEEKDAY_OPTIONS.map((item) => ({
      ...item,
      active: weeklyOpenDays.includes(item.value)
    })),
    overrideDates: Object.keys(dateSlotOverrides).sort(compareText),
    ruleSummary: buildRuleSummary(nextForm),
    slotPresetOptions: buildPresetItems({
      dailySlots: uniqueSortedSlots(form.dailySlots)
    })
  };
}

function validateForm(form) {
  const advanceOpenDays = Number(form.advanceOpenDays);
  if (!Number.isInteger(advanceOpenDays) || advanceOpenDays < 0) {
    return '请填写大于等于 0 的整数开放天数。';
  }

  if (!Array.isArray(form.dailySlots) || !form.dailySlots.length) {
    return '请至少添加一个每日可预约时段。';
  }

  if (form.dailySlots.some((slot) => !isDailySlotText(slot))) {
    return '每日可预约时段请使用 HH:mm-HH:mm 格式，例如 10:00-11:30。';
  }

  if (hasSlotOverlap(form.dailySlots)) {
    return '每日可预约时段不能重叠，请调整后再保存。';
  }

  if (form.closedDates.some((date) => !isDateText(date))) {
    return '闭店日期请使用 YYYY-MM-DD 格式，例如 2026-03-18。';
  }

  if (!normalizeWeeklyOpenDays(form.weeklyOpenDays).length) {
    return '请至少选择一个每周营业日。';
  }

  if (form.sameDayCutoffTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.sameDayCutoffTime)) {
    return '当天截止时间请使用 HH:mm 格式。';
  }

  const minAdvanceHours = Number(form.minAdvanceHours || 0);
  if (!Number.isInteger(minAdvanceHours) || minAdvanceHours < 0) {
    return '提前预约小时数必须是大于等于 0 的整数。';
  }

  const overrides = normalizeDateSlotOverrides(form.dateSlotOverrides);
  const invalidOverride = Object.keys(overrides).find((dateText) => hasSlotOverlap(overrides[dateText]));
  if (invalidOverride) {
    return `${invalidOverride} 的特殊时段不能重叠。`;
  }

  return '';
}

Page({
  data: {
    pageState: 'loading',
    stateMessage: '',
    submitState: 'idle',
    submitMessage: '',
    updatedAtText: '',
    ruleSummary: [],
    advanceOpenDayOptions: buildAdvanceOptionItems('7'),
    advanceOpenDaysIndex: 4,
    weeklyOpenDayOptions: WEEKDAY_OPTIONS.map((item) => ({ ...item, active: true })),
    draftClosedDate: '',
    draftSlotStart: '10:00',
    draftSlotEnd: '11:00',
    draftOverrideDate: '',
    draftOverrideSlotStart: '10:00',
    draftOverrideSlotEnd: '11:00',
    overrideDates: [],
    slotPresetOptions: buildPresetItems({ dailySlots: ['10:00-11:00'] }),
    staffIdentity: {
      openId: '',
      label: '未设置店员 OpenID',
      canUse: false,
      isMock: false,
      isDevelopEnv: false,
      sourceText: ''
    },
    staffOpenIdInput: '',
    form: getDefaultForm()
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

  applyViewState(source) {
    this.setData(buildViewState(source));
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
    this.applyViewState({ form: getDefaultForm(), updatedAt: '' });
    this.setData({
      staffOpenIdInput: '',
      pageState: 'unauthorized',
      stateMessage: '店员 OpenID 已清空，店员页不会再静默请求 staff 接口。'
    });
    wx.showToast({ title: '已清空店员 OpenID', icon: 'none' });
  },

  createDraft() {
    this.applyViewState({ form: getDefaultForm(), updatedAt: '' });
    this.setData({
      pageState: 'ready',
      stateMessage: '',
      submitMessage: ''
    });
  },

  goAppointments() {
    wx.redirectTo({
      url: '/pages/staff/appointments/index'
    });
  },

  goGallery() {
    wx.redirectTo({
      url: '/pages/staff/gallery/index'
    });
  },

  changeAdvanceOpenDays(value) {
    const nextValue = `${Math.max(0, Number(value) || 0)}`;
    const nextForm = {
      ...this.data.form,
      advanceOpenDays: nextValue
    };
    this.applyViewState({ form: nextForm, updatedAt: this.data.updatedAtText });
  },

  onAdvanceOpenDaysPickerChange(event) {
    const index = Number(event.detail.value) || 0;
    const value = ADVANCE_OPEN_DAY_OPTIONS[index] !== undefined ? ADVANCE_OPEN_DAY_OPTIONS[index] : 0;
    this.changeAdvanceOpenDays(value);
  },

  pickAdvanceOption(event) {
    const { value } = event.currentTarget.dataset;
    this.changeAdvanceOpenDays(value);
  },

  stepAdvanceOpenDays(event) {
    const { delta } = event.currentTarget.dataset;
    const nextValue = Math.max(0, Number(this.data.form.advanceOpenDays || 0) + Number(delta || 0));
    this.changeAdvanceOpenDays(nextValue);
  },

  toggleWeeklyOpenDay(event) {
    const value = Number(event.currentTarget.dataset.value);
    const current = normalizeWeeklyOpenDays(this.data.form.weeklyOpenDays);
    const nextDays = current.includes(value)
      ? current.filter((item) => item !== value)
      : normalizeWeeklyOpenDays([...current, value]);
    if (!nextDays.length) {
      wx.showToast({ title: '至少保留一个营业日', icon: 'none' });
      return;
    }

    const nextForm = {
      ...this.data.form,
      weeklyOpenDays: nextDays
    };
    this.applyViewState({ form: nextForm, updatedAt: this.data.updatedAtText });
  },

  onSameDayCutoffChange(event) {
    const nextForm = {
      ...this.data.form,
      sameDayCutoffTime: event.detail.value
    };
    this.applyViewState({ form: nextForm, updatedAt: this.data.updatedAtText });
  },

  clearSameDayCutoff() {
    const nextForm = {
      ...this.data.form,
      sameDayCutoffTime: ''
    };
    this.applyViewState({ form: nextForm, updatedAt: this.data.updatedAtText });
  },

  stepMinAdvanceHours(event) {
    const { delta } = event.currentTarget.dataset;
    const nextForm = {
      ...this.data.form,
      minAdvanceHours: `${Math.max(0, Number(this.data.form.minAdvanceHours || 0) + Number(delta || 0))}`
    };
    this.applyViewState({ form: nextForm, updatedAt: this.data.updatedAtText });
  },

  onDraftClosedDateChange(event) {
    this.setData({
      draftClosedDate: event.detail.value
    });
  },

  addClosedDate() {
    const value = this.data.draftClosedDate;
    if (!isDateText(value)) {
      wx.showToast({ title: '请选择有效闭店日期', icon: 'none' });
      return;
    }

    const nextForm = {
      ...this.data.form,
      closedDates: uniqueSortedDates([...(this.data.form.closedDates || []), value])
    };
    this.applyViewState({ form: nextForm, updatedAt: this.data.updatedAtText });
    this.setData({ draftClosedDate: '' });
  },

  removeClosedDate(event) {
    const { date } = event.currentTarget.dataset;
    const nextForm = {
      ...this.data.form,
      closedDates: (this.data.form.closedDates || []).filter((item) => item !== date)
    };
    this.applyViewState({ form: nextForm, updatedAt: this.data.updatedAtText });
  },

  onDraftSlotTimeChange(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({
      [field]: event.detail.value
    });
  },

  applySlotPreset(event) {
    const { start, end } = event.currentTarget.dataset;
    this.setData({
      draftSlotStart: start || this.data.draftSlotStart,
      draftSlotEnd: end || this.data.draftSlotEnd
    });
  },

  addDailySlot() {
    const start = this.data.draftSlotStart;
    const end = this.data.draftSlotEnd;
    const startMinutes = timeTextToMinutes(start);
    const endMinutes = timeTextToMinutes(end);

    if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
      wx.showToast({ title: '请选择有效时段', icon: 'none' });
      return;
    }

    const slot = `${start}-${end}`;
    const nextSlots = uniqueSortedSlots([...(this.data.form.dailySlots || []), slot]);
    const nextForm = {
      ...this.data.form,
      dailySlots: nextSlots
    };

    this.applyViewState({ form: nextForm, updatedAt: this.data.updatedAtText });
  },

  removeDailySlot(event) {
    const { slot } = event.currentTarget.dataset;
    const nextForm = {
      ...this.data.form,
      dailySlots: (this.data.form.dailySlots || []).filter((item) => item !== slot)
    };
    this.applyViewState({ form: nextForm, updatedAt: this.data.updatedAtText });
  },

  onDraftOverrideDateChange(event) {
    this.setData({
      draftOverrideDate: event.detail.value
    });
  },

  onDraftOverrideTimeChange(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({
      [field]: event.detail.value
    });
  },

  addDateSlotOverride() {
    const dateText = this.data.draftOverrideDate;
    const start = this.data.draftOverrideSlotStart;
    const end = this.data.draftOverrideSlotEnd;
    const startMinutes = timeTextToMinutes(start);
    const endMinutes = timeTextToMinutes(end);

    if (!isDateText(dateText)) {
      wx.showToast({ title: '请选择特殊日期', icon: 'none' });
      return;
    }

    if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
      wx.showToast({ title: '请选择有效特殊时段', icon: 'none' });
      return;
    }

    const slot = `${start}-${end}`;
    const overrides = normalizeDateSlotOverrides(this.data.form.dateSlotOverrides);
    const nextOverrides = {
      ...overrides,
      [dateText]: uniqueSortedSlots([...(overrides[dateText] || []), slot])
    };
    const nextForm = {
      ...this.data.form,
      dateSlotOverrides: nextOverrides
    };

    this.applyViewState({ form: nextForm, updatedAt: this.data.updatedAtText });
  },

  removeDateSlotOverride(event) {
    const { date, slot } = event.currentTarget.dataset;
    const overrides = normalizeDateSlotOverrides(this.data.form.dateSlotOverrides);
    const nextSlots = (overrides[date] || []).filter((item) => item !== slot);
    const nextOverrides = { ...overrides };
    if (nextSlots.length) {
      nextOverrides[date] = nextSlots;
    } else {
      delete nextOverrides[date];
    }

    this.applyViewState({
      form: {
        ...this.data.form,
        dateSlotOverrides: nextOverrides
      },
      updatedAt: this.data.updatedAtText
    });
  },

  removeOverrideDate(event) {
    const { date } = event.currentTarget.dataset;
    const overrides = normalizeDateSlotOverrides(this.data.form.dateSlotOverrides);
    delete overrides[date];
    this.applyViewState({
      form: {
        ...this.data.form,
        dateSlotOverrides: overrides
      },
      updatedAt: this.data.updatedAtText
    });
  },

  async loadData() {
    const staffIdentity = getStaffIdentityMeta();
    if (!staffIdentity.canUse) {
      this.setData({
        staffIdentity,
        pageState: 'unauthorized',
        stateMessage: staffIdentity.isDevelopEnv
          ? '未获取到店员 OpenID。开发环境请先填写或生成模拟 OpenID，再查询店员规则。'
          : '未获取到店员 OpenID，当前无法查询店员页。'
      });
      this.applyViewState({ form: getDefaultForm(), updatedAt: '' });
      return;
    }

    this.setData({
      staffIdentity,
      pageState: 'loading',
      stateMessage: '',
      submitMessage: ''
    });

    try {
      const rules = normalizeRules(await listStaffRules());
      this.applyViewState(rules);
      this.setData({
        pageState: hasRulesContent(rules) ? 'ready' : 'empty',
        stateMessage: hasRulesContent(rules) ? '' : '当前还没有店员规则配置。'
      });
    } catch (error) {
      this.applyViewState({ form: getDefaultForm(), updatedAt: '' });
      this.setData({
        pageState: error.isUnauthorized ? 'unauthorized' : 'error',
        stateMessage: formatPageErrorMessage(error, '店员规则页加载失败，请稍后重试。')
      });
    }
  },

  async submit() {
    const { staffIdentity, form } = this.data;

    if (!staffIdentity.canUse) {
      this.setData({
        pageState: 'unauthorized',
        stateMessage: '缺少店员 OpenID，当前不能提交规则。'
      });
      wx.showToast({ title: '缺少店员 OpenID', icon: 'none' });
      return;
    }

    const validationMessage = validateForm(form);
    if (validationMessage) {
      this.setData({
        submitMessage: validationMessage
      });
      wx.showToast({ title: '请检查规则表单', icon: 'none' });
      return;
    }

    this.setData({
      submitState: 'submitting',
      submitMessage: ''
    });

    try {
      await updateStaffRules(buildSubmitPayload(form));
      wx.showToast({ title: '规则已保存', icon: 'success' });
      await this.loadData();
    } catch (error) {
      if (error.isUnauthorized) {
        this.setData({
          pageState: 'unauthorized',
          stateMessage: formatPageErrorMessage(error, '当前身份无权提交店员规则。')
        });
        return;
      }

      this.setData({
        submitMessage: formatSubmitErrorMessage(error)
      });
      wx.showToast({ title: '提交失败', icon: 'none' });
    } finally {
      this.setData({
        submitState: 'idle'
      });
    }
  }
});
