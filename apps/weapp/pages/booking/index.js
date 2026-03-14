const { getAvailability, createAppointment } = require('../../services/appointment');

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatMonth(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function createMonthDate(month) {
  const [year, monthValue] = month.split('-').map(Number);
  return new Date(year, monthValue - 1, 1);
}

function shiftMonth(month, delta) {
  const date = createMonthDate(month);
  date.setMonth(date.getMonth() + delta);
  return formatMonth(date);
}

function normalizeDays(days) {
  return (days || []).map((item) => ({
    ...item,
    label: item.date.slice(5).replace('-', '/'),
    shortDay: item.date.slice(-2)
  }));
}

Page({
  data: {
    currentMonth: formatMonth(new Date()),
    days: [],
    selectedDate: '',
    selectedSlots: [],
    selectedSlot: '',
    loadingAvailability: false,
    isSubmitting: false,
    form: {
      customerName: '',
      phone: '',
      note: ''
    }
  },

  onLoad() {
    this.loadAvailability(this.data.currentMonth);
  },

  async onPullDownRefresh() {
    await this.loadAvailability(this.data.currentMonth);
    wx.stopPullDownRefresh();
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail.value;
    this.setData({
      [`form.${field}`]: value
    });
  },

  async loadAvailability(month) {
    this.setData({
      loadingAvailability: true,
      currentMonth: month
    });

    try {
      const res = await getAvailability(month);
      const days = normalizeDays(res.days || []);
      const fallbackDay = days.find((item) => item.bookable) || null;
      const nextSelectedDate = fallbackDay ? fallbackDay.date : '';
      const nextSelectedSlots = fallbackDay ? fallbackDay.slots || [] : [];
      const nextSelectedSlot =
        nextSelectedSlots.find((slot) => slot.bookable)?.value || '';

      this.setData({
        days,
        selectedDate: nextSelectedDate,
        selectedSlots: nextSelectedSlots,
        selectedSlot: nextSelectedSlot,
        loadingAvailability: false
      });
    } catch (error) {
      this.setData({
        days: [],
        selectedDate: '',
        selectedSlots: [],
        selectedSlot: '',
        loadingAvailability: false
      });
      wx.showToast({
        title: '预约时段加载失败',
        icon: 'none'
      });
    }
  },

  prevMonth() {
    this.loadAvailability(shiftMonth(this.data.currentMonth, -1));
  },

  nextMonth() {
    this.loadAvailability(shiftMonth(this.data.currentMonth, 1));
  },

  selectDate(e) {
    const { date } = e.currentTarget.dataset;
    const day = this.data.days.find((item) => item.date === date);
    if (!day || !day.bookable) {
      return;
    }

    this.setData({
      selectedDate: day.date,
      selectedSlots: day.slots || [],
      selectedSlot: (day.slots || []).find((slot) => slot.bookable)?.value || ''
    });
  },

  selectSlot(e) {
    const { value } = e.currentTarget.dataset;
    const slot = this.data.selectedSlots.find((item) => item.value === value);
    if (!slot || !slot.bookable) {
      return;
    }
    this.setData({
      selectedSlot: value
    });
  },

  async submit() {
    const { form, selectedDate, selectedSlot, isSubmitting } = this.data;
    if (isSubmitting) {
      return;
    }

    if (!form.customerName || !form.phone) {
      wx.showToast({ title: '请填写姓名和手机号', icon: 'none' });
      return;
    }

    if (!selectedDate || !selectedSlot) {
      wx.showToast({ title: '请选择可预约日期和时间段', icon: 'none' });
      return;
    }

    this.setData({ isSubmitting: true });
    try {
      await createAppointment({
        customerName: form.customerName,
        phone: form.phone,
        appointmentDate: selectedDate,
        timeSlot: selectedSlot,
        note: form.note
      });
      wx.setStorageSync('lastBookingPhone', form.phone);
      wx.showToast({ title: '已提交，待审核', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/my-bookings/index?phone=${encodeURIComponent(form.phone)}`
        });
      }, 700);
    } catch (error) {
      wx.showToast({
        title: error.code === 'INVALID_SLOT' ? '该时间段已不可预约' : '提交失败',
        icon: 'none'
      });
    } finally {
      this.setData({ isSubmitting: false });
    }
  }
});
