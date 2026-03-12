const { listServices, listAppointments } = require('../../services/appointment');

Page({
  data: {
    services: [],
    appointments: []
  },

  onLoad() {
    this.loadData();
  },

  async onPullDownRefresh() {
    await this.loadData();
    wx.stopPullDownRefresh();
  },

  async loadData() {
    try {
      const [serviceRes, appointmentRes] = await Promise.all([
        listServices(),
        listAppointments()
      ]);
      this.setData({
        services: serviceRes.items || [],
        appointments: appointmentRes.items || []
      });
    } catch (error) {
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  goBooking() {
    wx.navigateTo({
      url: '/pages/booking/index'
    });
  }
});
