const { createAppointment, listServices } = require('../../services/appointment');

Page({
  data: {
    services: [],
    serviceIndex: 0,
    form: {
      customerName: '',
      phone: '',
      date: '2026-03-12',
      timeSlot: '14:00-15:00',
      note: ''
    }
  },

  async onLoad() {
    try {
      const res = await listServices();
      this.setData({ services: res.items || [] });
    } catch (error) {
      wx.showToast({ title: '服务加载失败', icon: 'none' });
    }
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    this.setData({
      [`form.${field}`]: value
    });
  },

  onServiceChange(e) {
    this.setData({ serviceIndex: Number(e.detail.value) });
  },

  async submit() {
    const { services, serviceIndex, form } = this.data;
    if (!form.customerName || !form.phone) {
      wx.showToast({ title: '请填写姓名和手机号', icon: 'none' });
      return;
    }

    const service = services[serviceIndex];
    if (!service) {
      wx.showToast({ title: '请选择服务项目', icon: 'none' });
      return;
    }

    try {
      await createAppointment({
        ...form,
        serviceId: service.id,
        serviceName: service.name
      });
      wx.showToast({ title: '预约已提交', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 800);
    } catch (error) {
      wx.showToast({ title: '提交失败', icon: 'none' });
    }
  }
});
