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
const {
  ensureAuthSession,
  getStoredAuthSession,
  logoutAuthSession,
  clearAuthSession
} = require('./utils/auth');

App({
  globalData: {
    appName: '美甲预约',
    apiBaseUrl: 'http://127.0.0.1:3100',
    apiProfile: {
      key: 'api',
      label: '当前主线 · apps/api',
      shortLabel: 'apps/api',
      baseUrl: 'http://127.0.0.1:3100',
      enableWechatAuth: false,
      allowHeaderAuthFallback: true,
      isDefault: true,
      isDevelopEnv: true,
      canSwitch: false,
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
    authSession: null,
    enableWechatAuth: false,
    allowHeaderAuthFallback: true,
    isDevelopEnv: true
  },

  onLaunch() {
    this.refreshApiProfile();
    this.refreshCustomerIdentity();
    this.refreshAuthSession();
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
    this.globalData.enableWechatAuth = !!apiProfile.enableWechatAuth;
    this.globalData.allowHeaderAuthFallback = !!apiProfile.allowHeaderAuthFallback;
    this.globalData.isDevelopEnv = isDevelopEnv();
    return apiProfile;
  },

  getCustomerIdentity() {
    return this.refreshCustomerIdentity();
  },

  getApiProfile() {
    return this.refreshApiProfile();
  },

  refreshAuthSession() {
    const authSession = getStoredAuthSession();
    this.globalData.authSession = authSession;
    return authSession;
  },

  ensureAuthSession() {
    return ensureAuthSession()
      .then((authSession) => {
        this.globalData.authSession = authSession;
        return authSession;
      });
  },

  clearAuthSession() {
    clearAuthSession();
    this.globalData.authSession = null;
  },

  logoutAuthSession() {
    return logoutAuthSession()
      .then((result) => {
        this.globalData.authSession = null;
        return result;
      });
  },

  setApiProfile(profileKey) {
    const apiProfile = setApiProfile(profileKey);
    this.globalData.apiProfile = apiProfile;
    this.globalData.apiBaseUrl = apiProfile.baseUrl;
    this.globalData.enableWechatAuth = !!apiProfile.enableWechatAuth;
    this.globalData.allowHeaderAuthFallback = !!apiProfile.allowHeaderAuthFallback;
    this.globalData.isDevelopEnv = isDevelopEnv();
    return apiProfile;
  },

  resetApiProfile() {
    const apiProfile = resetApiProfile();
    this.globalData.apiProfile = apiProfile;
    this.globalData.apiBaseUrl = apiProfile.baseUrl;
    this.globalData.enableWechatAuth = !!apiProfile.enableWechatAuth;
    this.globalData.allowHeaderAuthFallback = !!apiProfile.allowHeaderAuthFallback;
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
