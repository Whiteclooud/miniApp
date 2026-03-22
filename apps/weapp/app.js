const {
  ensureCustomerIdentity,
  setCustomerOpenId,
  clearCustomerOpenId,
  createMockOpenId,
  isDevelopEnv
} = require('./utils/customer');
const {
  ensureApiProfile,
  setApiProfile,
  resetApiProfile
} = require('./utils/api-profile');

App({
  globalData: {
    appName: '美甲预约',
    apiBaseUrl: 'http://127.0.0.1:3000',
    apiProfile: {
      key: 'legacy',
      label: '稳定基线 · apps/server',
      shortLabel: 'apps/server',
      baseUrl: 'http://127.0.0.1:3000',
      isDefault: true,
      isDevelopEnv: true,
      canSwitch: true,
      source: 'default'
    },
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
    this.refreshApiProfile();
  },

  refreshCustomerIdentity() {
    const customerIdentity = ensureCustomerIdentity({ persistDevelopFallback: true });
    this.globalData.customerIdentity = customerIdentity;
    this.globalData.isDevelopEnv = isDevelopEnv();
    return customerIdentity;
  },

  refreshApiProfile() {
    const apiProfile = ensureApiProfile();
    this.globalData.apiProfile = apiProfile;
    this.globalData.apiBaseUrl = apiProfile.baseUrl;
    this.globalData.isDevelopEnv = isDevelopEnv();
    return apiProfile;
  },

  getCustomerIdentity() {
    return this.refreshCustomerIdentity();
  },

  getApiProfile() {
    return this.refreshApiProfile();
  },

  setApiProfile(profileKey) {
    const apiProfile = setApiProfile(profileKey);
    this.globalData.apiProfile = apiProfile;
    this.globalData.apiBaseUrl = apiProfile.baseUrl;
    this.globalData.isDevelopEnv = isDevelopEnv();
    return apiProfile;
  },

  resetApiProfile() {
    const apiProfile = resetApiProfile();
    this.globalData.apiProfile = apiProfile;
    this.globalData.apiBaseUrl = apiProfile.baseUrl;
    this.globalData.isDevelopEnv = isDevelopEnv();
    return apiProfile;
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
