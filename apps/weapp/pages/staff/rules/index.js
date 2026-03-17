const { listStaffRules, updateStaffRules } = require('../../../services/appointment');
const {
  ensureStaffIdentity,
  setStaffOpenId,
  clearStaffOpenId,
  createMockStaffOpenId
} = require('../../../utils/staff');
const { getErrorKind, getErrorMessage } = require('../../../utils/request');
const { isDevelopEnv } = require('../../../utils/customer');

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

function normalizeRules(response) {
  const source = response.item || response.rules || response.data || response || {};

  return {
    advanceOpenDays: normalizeAdvanceOpenDays(source.advanceOpenDays),
    closedDates: normalizeStringList(source.closedDates),
    dailySlots: normalizeStringList(source.dailySlots),
    updatedAt: source.updatedAt || response.updatedAt || ''
  };
}

function hasRulesContent(rules) {
  return Boolean(
    rules.advanceOpenDays !== '' ||
    rules.closedDates.length ||
    rules.dailySlots.length
  );
}

function getDefaultForm() {
  return {
    advanceOpenDays: '',
    closedDates: [],
    dailySlots: [],
    updatedAt: ''
  };
}

function buildEditorState(rules) {
  return {
    form: {
      advanceOpenDays: rules.advanceOpenDays,
      closedDates: [...rules.closedDates],
      dailySlots: [...rules.dailySlots],
      updatedAt: rules.updatedAt
    },
    dailySlotsText: rules.dailySlots.join('\n'),
    closedDatesText: rules.closedDates.join('\n'),
    updatedAtText: formatTime(rules.updatedAt)
  };
}

function buildSubmitPayload(form) {
  return {
    advanceOpenDays: Number(form.advanceOpenDays),
    dailySlots: [...form.dailySlots],
    closedDates: [...form.closedDates]
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

function validateForm(form) {
  const advanceOpenDays = Number(form.advanceOpenDays);
  if (!Number.isInteger(advanceOpenDays) || advanceOpenDays < 0) {
    return '请填写大于等于 0 的整数开放天数。';
  }

  if (!Array.isArray(form.dailySlots) || !form.dailySlots.length) {
    return '请至少填写一个每日可预约时段。';
  }

  if (form.dailySlots.some((slot) => !isDailySlotText(slot))) {
    return '每日可预约时段请使用 HH:mm-HH:mm 格式，例如 10:00-11:30。';
  }

  if (form.closedDates.some((date) => !isDateText(date))) {
    return '闭店日期请使用 YYYY-MM-DD 格式，例如 2026-03-18。';
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
    dailySlotsText: '',
    closedDatesText: '',
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
      ...buildEditorState(getDefaultForm()),
      pageState: 'unauthorized',
      stateMessage: '店员 OpenID 已清空，店员页不会再静默请求 staff 接口。'
    });
    wx.showToast({ title: '已清空店员 OpenID', icon: 'none' });
  },

  onInput(event) {
    const { field } = event.currentTarget.dataset;
    const { value } = event.detail;

    if (field === 'dailySlots') {
      this.setData({
        dailySlotsText: value,
        'form.dailySlots': normalizeStringList(value)
      });
      return;
    }

    if (field === 'closedDates') {
      this.setData({
        closedDatesText: value,
        'form.closedDates': normalizeStringList(value)
      });
      return;
    }

    this.setData({
      [`form.${field}`]: value
    });
  },

  createDraft() {
    this.setData({
      pageState: 'ready',
      stateMessage: '',
      submitMessage: '',
      ...buildEditorState(getDefaultForm())
    });
  },

  goAppointments() {
    wx.redirectTo({
      url: '/pages/staff/appointments/index'
    });
  },

  async loadData() {
    const staffIdentity = getStaffIdentityMeta();
    if (!staffIdentity.canUse) {
      this.setData({
        staffIdentity,
        ...buildEditorState(getDefaultForm()),
        pageState: 'unauthorized',
        stateMessage: staffIdentity.isDevelopEnv
          ? '未获取到店员 OpenID。开发环境请先填写或生成模拟 OpenID，再查询店员规则。'
          : '未获取到店员 OpenID，当前无法查询店员页。'
      });
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
      const hasContent = hasRulesContent(rules);
      this.setData({
        ...buildEditorState(rules),
        pageState: hasContent ? 'ready' : 'empty',
        stateMessage: hasContent ? '' : '当前还没有店员规则配置。'
      });
    } catch (error) {
      this.setData({
        ...buildEditorState(getDefaultForm()),
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
