const { isDevelopEnv } = require('./customer');

const STORAGE_KEY = 'miniapp.apiProfile';
const DEFAULT_PROFILE = 'api';

const PROFILE_MAP = {
  api: {
    key: 'api',
    label: '当前主线 · apps/api',
    shortLabel: 'apps/api',
    baseUrl: 'http://127.0.0.1:3100',
    enableWechatAuth: false,
    allowHeaderAuthFallback: true
  },
  trial: {
    key: 'trial',
    label: '体验版 · HTTPS API',
    shortLabel: 'trial',
    baseUrl: 'https://api.whiteclooud.asia',
    enableWechatAuth: true,
    allowHeaderAuthFallback: false,
    requiresConfiguration: true
  },
  release: {
    key: 'release',
    label: '正式版 · HTTPS API',
    shortLabel: 'release',
    baseUrl: 'https://api.whiteclooud.asia',
    enableWechatAuth: true,
    allowHeaderAuthFallback: false,
    requiresConfiguration: true
  }
};

function getRuntimeEnvVersion() {
  try {
    const accountInfo = wx.getAccountInfoSync();
    return accountInfo.miniProgram.envVersion || 'develop';
  } catch (_error) {
    return 'develop';
  }
}

function getRuntimePlatform() {
  try {
    const deviceInfo = typeof wx.getDeviceInfo === 'function'
      ? wx.getDeviceInfo()
      : wx.getSystemInfoSync();
    return `${deviceInfo.platform || ''}`.trim().toLowerCase();
  } catch (_error) {
    return 'devtools';
  }
}

function normalizeProfileKey(profileKey) {
  return PROFILE_MAP[profileKey] ? profileKey : DEFAULT_PROFILE;
}

function resolveRuntimeProfileKey() {
  const envVersion = getRuntimeEnvVersion();

  if (envVersion === 'trial') {
    return 'trial';
  }

  if (envVersion === 'release') {
    return 'release';
  }

  // Real-device debugging still reports envVersion=develop. Use the HTTPS
  // profile there because 127.0.0.1 would point at the phone itself.
  if (getRuntimePlatform() !== 'devtools') {
    return 'trial';
  }

  return DEFAULT_PROFILE;
}

function buildProfile(profileKey, extra = {}) {
  const normalizedKey = normalizeProfileKey(profileKey);
  const profile = PROFILE_MAP[normalizedKey];

  return {
    key: profile.key,
    label: profile.label,
    shortLabel: profile.shortLabel,
    baseUrl: profile.baseUrl,
    enableWechatAuth: !!profile.enableWechatAuth,
    allowHeaderAuthFallback: !!profile.allowHeaderAuthFallback,
    requiresConfiguration: !!profile.requiresConfiguration,
    isDefault: normalizedKey === resolveRuntimeProfileKey(),
    isDevelopEnv: !!extra.isDevelopEnv,
    canSwitch: isDevelopEnv(),
    source: extra.source || 'default'
  };
}

function ensureApiProfile() {
  wx.removeStorageSync(STORAGE_KEY);
  return buildProfile(resolveRuntimeProfileKey(), {
    isDevelopEnv: isDevelopEnv(),
    source: 'default'
  });
}

function setApiProfile(profileKey) {
  wx.removeStorageSync(STORAGE_KEY);
  return buildProfile(profileKey || resolveRuntimeProfileKey(), {
    isDevelopEnv: isDevelopEnv(),
    source: 'manual'
  });
}

function resetApiProfile() {
  wx.removeStorageSync(STORAGE_KEY);
  return buildProfile(resolveRuntimeProfileKey(), {
    isDevelopEnv: isDevelopEnv(),
    source: 'default'
  });
}

module.exports = {
  STORAGE_KEY,
  DEFAULT_PROFILE,
  PROFILE_MAP,
  ensureApiProfile,
  setApiProfile,
  resetApiProfile
};
