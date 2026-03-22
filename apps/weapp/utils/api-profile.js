const { isDevelopEnv } = require('./customer');

const STORAGE_KEY = 'miniapp.apiProfile';
const DEFAULT_PROFILE = 'legacy';

const PROFILE_MAP = {
  legacy: {
    key: 'legacy',
    label: '稳定基线 · apps/server',
    shortLabel: 'apps/server',
    baseUrl: 'http://127.0.0.1:3000'
  },
  api: {
    key: 'api',
    label: '受控联调 · apps/api',
    shortLabel: 'apps/api',
    baseUrl: 'http://127.0.0.1:3100'
  }
};

function normalizeProfileKey(profileKey) {
  return PROFILE_MAP[profileKey] ? profileKey : DEFAULT_PROFILE;
}

function buildProfile(profileKey, extra = {}) {
  const normalizedKey = normalizeProfileKey(profileKey);
  const profile = PROFILE_MAP[normalizedKey];

  return {
    key: profile.key,
    label: profile.label,
    shortLabel: profile.shortLabel,
    baseUrl: profile.baseUrl,
    isDefault: normalizedKey === DEFAULT_PROFILE,
    isDevelopEnv: !!extra.isDevelopEnv,
    canSwitch: !!extra.isDevelopEnv,
    source: extra.source || (normalizedKey === DEFAULT_PROFILE ? 'default' : 'storage')
  };
}

function ensureApiProfile() {
  const develop = isDevelopEnv();

  if (!develop) {
    return buildProfile(DEFAULT_PROFILE, {
      isDevelopEnv: false,
      source: 'default'
    });
  }

  const storedProfile = normalizeProfileKey(wx.getStorageSync(STORAGE_KEY));
  return buildProfile(storedProfile, {
    isDevelopEnv: true,
    source: storedProfile === DEFAULT_PROFILE ? 'default' : 'storage'
  });
}

function setApiProfile(profileKey) {
  const develop = isDevelopEnv();
  const normalizedKey = normalizeProfileKey(profileKey);

  if (!develop) {
    wx.removeStorageSync(STORAGE_KEY);
    return buildProfile(DEFAULT_PROFILE, {
      isDevelopEnv: false,
      source: 'default'
    });
  }

  wx.setStorageSync(STORAGE_KEY, normalizedKey);
  return buildProfile(normalizedKey, {
    isDevelopEnv: true,
    source: normalizedKey === DEFAULT_PROFILE ? 'default' : 'storage'
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
