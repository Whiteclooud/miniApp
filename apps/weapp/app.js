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
  loginWithPhoneCode,
  getStoredAuthSession,
  updateCurrentUser,
  logoutAuthSession,
  clearAuthSession,
  setAppContext
} = require('./utils/auth');
const { resolveLaunchTarget } = require('./utils/launch');

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
    launchOptions: null,
    customerIdentity: {
      openId: '',
      source: 'missing',
      isMock: false,
      isDefaultMock: false,
      canUse: false,
      label: '未设置顾客 OpenID'
    },
    authSession: null,
    launchState: 'idle',
    launchError: null,
    launchTarget: '',
    enableWechatAuth: false,
    allowHeaderAuthFallback: true,
    isDevelopEnv: true
  },

  onLaunch(options) {
    setAppContext(this);
    this.refreshApiProfile();
    this.refreshCustomerIdentity();
    this.refreshAuthSession();
    this.globalData.launchOptions = options || null;

    // getApp() is not guaranteed to resolve during the synchronous onLaunch
    // callback. Let the first page (or this deferred task) start auth after
    // the App instance has been registered by the runtime.
    setTimeout(() => {
      this.ensureLaunchReady().catch(() => {});
    }, 0);
  },

  ensureLaunchReady(pageOptions = {}) {
    if (this.launchPromise) {
      return this.launchPromise;
    }

    const launchOptions = this.globalData.launchOptions || {};
    this.globalData.launchState = 'loading';
    this.globalData.launchError = null;
    this.launchPromise = (async () => {
      const profile = this.getApiProfile();
      let session = null;
      if (!profile.enableWechatAuth) {
        this.clearAuthSession();
      } else {
        session = await this.ensureAuthSession({ validate: true });
      }

      const target = resolveLaunchTarget({
        user: session && session.user,
        isDevelop: !profile.enableWechatAuth,
        launchOptions,
        pageOptions
      });
      this.globalData.launchState = 'ready';
      this.globalData.launchTarget = target;
      return { session, target };
    })().catch((error) => {
      this.globalData.launchState = 'error';
      this.globalData.launchError = error;
      this.launchPromise = null;
      throw error;
    });

    return this.launchPromise;
  },

  refreshCustomerIdentity() {
    const customerIdentity = ensureCustomerIdentity({ persistDevelopFallback: true });
    this.globalData.customerIdentity = customerIdentity;
    this.globalData.isDevelopEnv = isDevelopEnv();
    return customerIdentity;
  },

  refreshApiProfile() {
    const apiProfile = ensureApiProfile();
    console.log('[miniapp] api profile', {
      key: apiProfile.key,
      baseUrl: apiProfile.baseUrl,
      enableWechatAuth: apiProfile.enableWechatAuth,
      envVersion: apiProfile.isDevelopEnv ? 'develop' : apiProfile.key
    });
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

  ensureAuthSession(options) {
    return ensureAuthSession(options)
      .then((authSession) => {
        this.globalData.authSession = authSession;
        this.refreshCustomerIdentity();
        return authSession;
      })
      .catch((error) => {
        console.error('[miniapp] auth session failed', {
          code: error && error.code,
          statusCode: error && error.statusCode,
          message: error && error.message
        });
        return Promise.reject(error);
      });
  },

  loginWithPhoneCode(phoneCode) {
    return loginWithPhoneCode(phoneCode)
      .then((authSession) => {
        this.globalData.authSession = authSession;
        this.refreshCustomerIdentity();
        return authSession;
      });
  },

  updateCurrentUser(user) {
    const authSession = updateCurrentUser(user);
    this.globalData.authSession = authSession;
    this.refreshCustomerIdentity();
    return authSession;
  },

  clearAuthSession() {
    clearAuthSession();
    this.globalData.authSession = null;
    this.refreshCustomerIdentity();
  },

  logoutAuthSession() {
    return logoutAuthSession()
      .then((result) => {
        this.globalData.authSession = null;
        this.refreshCustomerIdentity();
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
