const {
  ensureCustomerIdentity,
  setCustomerOpenId,
  clearCustomerOpenId,
  createMockOpenId,
  isDevelopEnv
} = require('./utils/customer');

App({
  globalData: {
    appName: '美甲预约',
    apiBaseUrl: 'http://127.0.0.1:3000',
    customerIdentity: {
      openId: '',
      source: 'missing',
      isMock: false,
      isDefaultMock: false,
      canUse: false,
      label: '未设置顾客 OpenID'
    },
    isDevelopEnv: true
  },

  onLaunch() {
    this.refreshCustomerIdentity();
  },

  refreshCustomerIdentity() {
    const customerIdentity = ensureCustomerIdentity({ persistDevelopFallback: true });
    this.globalData.customerIdentity = customerIdentity;
    this.globalData.isDevelopEnv = isDevelopEnv();
    return customerIdentity;
  },

  getCustomerIdentity() {
    return this.refreshCustomerIdentity();
  },

  setCustomerOpenId(openId) {
    const customerIdentity = setCustomerOpenId(openId);
    this.globalData.customerIdentity = customerIdentity;
    return customerIdentity;
  },

  createMockCustomerOpenId(openId) {
    const customerIdentity = setCustomerOpenId(openId || createMockOpenId());
    this.globalData.customerIdentity = customerIdentity;
    return customerIdentity;
  },

  clearCustomerOpenId() {
    const customerIdentity = clearCustomerOpenId();
    this.globalData.customerIdentity = customerIdentity;
    return customerIdentity;
  }
});
