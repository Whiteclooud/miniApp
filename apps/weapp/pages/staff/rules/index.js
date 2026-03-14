const {
  getBookingRules,
  updateBookingRules
} = require('../../../services/appointment');
const { STAFF_OPEN_ID_STORAGE_KEY } = require('../../../utils/request');

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseMinutes(value) {
  const [hour, minute] = String(value || '00:00').split(':').map(Number);
  return hour * 60 + minute;
}

function normalizeSlots(slots) {
  return (slots || []).map((item) => ({
    start: item.start || '10:00',
    end: item.end || '11:30'
  }));
}

Page({
  data: {
    authInput: '',
    authorized: false,
    loading: false,
    saving: false,
    pickerClosedDate: formatDate(new Date()),
    rule: {
      advanceOpenDays: 2,
      closedDates: [],
      dailySlots: [
        { start: '10:00', end: '11:30' }
      ]
    }
  },

  onLoad() {
    const authInput = wx.getStorageSync(STAFF_OPEN_ID_STORAGE_KEY) || '';
    this.setData({ authInput });
    if (authInput) {
      this.loadRules();
    }
  },

  async onPullDownRefresh() {
    if (this.data.authorized) {
      await this.loadRules();
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
    this.loadRules();
  },

  async loadRules() {
    this.setData({ loading: true });
    try {
      const res = await getBookingRules();
      this.setData({
        authorized: true,
        loading: false,
        rule: {
          advanceOpenDays: res.item?.advanceOpenDays || 0,
          closedDates: res.item?.closedDates || [],
          dailySlots: normalizeSlots(res.item?.dailySlots)
        }
      });
    } catch (error) {
      if (error.code === 'STAFF_UNAUTHORIZED') {
        this.setData({ authorized: false, loading: false });
        wx.showToast({ title: '当前账号无店员权限', icon: 'none' });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: '规则加载失败', icon: 'none' });
    }
  },

  onAdvanceDaysInput(e) {
    const value = e.detail.value.replace(/[^\d]/g, '');
    this.setData({
      'rule.advanceOpenDays': value
    });
  },

  onClosedDatePick(e) {
    this.setData({ pickerClosedDate: e.detail.value });
  },

  addClosedDate() {
    const { pickerClosedDate, rule } = this.data;
    const nextDates = [...new Set([...(rule.closedDates || []), pickerClosedDate])].sort();
    this.setData({
      'rule.closedDates': nextDates
    });
  },

  removeClosedDate(e) {
    const { date } = e.currentTarget.dataset;
    this.setData({
      'rule.closedDates': (this.data.rule.closedDates || []).filter((item) => item !== date)
    });
  },

  onSlotChange(e) {
    const { index, field } = e.currentTarget.dataset;
    this.setData({
      [`rule.dailySlots[${index}].${field}`]: e.detail.value
    });
  },

  addSlot() {
    const nextSlots = [...(this.data.rule.dailySlots || []), { start: '18:00', end: '19:30' }];
    this.setData({
      'rule.dailySlots': nextSlots
    });
  },

  removeSlot(e) {
    const index = Number(e.currentTarget.dataset.index);
    const nextSlots = [...(this.data.rule.dailySlots || [])];
    nextSlots.splice(index, 1);
    this.setData({
      'rule.dailySlots': nextSlots.length ? nextSlots : [{ start: '10:00', end: '11:30' }]
    });
  },

  validateRule() {
    const { rule } = this.data;
    const advanceOpenDays = Number(rule.advanceOpenDays);
    if (!Number.isInteger(advanceOpenDays) || advanceOpenDays < 0) {
      return '提前开放天数应为大于等于 0 的整数';
    }

    const slots = normalizeSlots(rule.dailySlots).sort((a, b) => parseMinutes(a.start) - parseMinutes(b.start));
    for (let index = 0; index < slots.length; index += 1) {
      const current = slots[index];
      if (parseMinutes(current.start) >= parseMinutes(current.end)) {
        return '时间段开始时间必须早于结束时间';
      }
      if (index > 0 && parseMinutes(current.start) < parseMinutes(slots[index - 1].end)) {
        return '时间段不能重叠';
      }
    }
    return '';
  },

  async submit() {
    const validationMessage = this.validateRule();
    if (validationMessage) {
      wx.showToast({ title: validationMessage, icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    try {
      await updateBookingRules({
        advanceOpenDays: Number(this.data.rule.advanceOpenDays),
        closedDates: this.data.rule.closedDates || [],
        dailySlots: normalizeSlots(this.data.rule.dailySlots)
      });
      wx.showToast({ title: '规则已保存', icon: 'success' });
      this.loadRules();
    } catch (error) {
      wx.showToast({
        title: error.code === 'STAFF_UNAUTHORIZED' ? '当前账号无店员权限' : '保存失败',
        icon: 'none'
      });
    } finally {
      this.setData({ saving: false });
    }
  },

  goAppointments() {
    wx.navigateTo({
      url: '/pages/staff/appointments/index'
    });
  }
});
