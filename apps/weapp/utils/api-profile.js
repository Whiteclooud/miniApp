const { isDevelopEnv } = require('./customer');

const STORAGE_KEY = 'miniapp.apiProfile';
const DEFAULT_PROFILE = 'api';

const PROFILE_MAP = {
  api: {
    key: 'api',
    label: '当前主线 · apps/api',
    shortLabel: 'apps/api',
    baseUrl: 'http://127.0.0.1:3100'
  }
};

function normalizeProfileKey() {
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
    isDefault: true,
    isDevelopEnv: !!extra.isDevelopEnv,
    canSwitch: false,
    source: extra.source || 'default'
  };
}

function ensureApiProfile() {
  wx.removeStorageSync(STORAGE_KEY);
  return buildProfile(DEFAULT_PROFILE, {
    isDevelopEnv: isDevelopEnv(),
    source: 'default'
  });
}

function setApiProfile() {
  wx.removeStorageSync(STORAGE_KEY);
  return buildProfile(DEFAULT_PROFILE, {
    isDevelopEnv: isDevelopEnv(),
    source: 'default'
  });
}

function resetApiProfile() {
  wx.removeStorageSync(STORAGE_KEY);
  return buildProfile(DEFAULT_PROFILE, {
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
