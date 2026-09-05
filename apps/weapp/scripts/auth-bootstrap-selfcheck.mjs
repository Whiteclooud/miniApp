import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const auth = require('../utils/auth.js');
const bootstrap = require('../utils/launch.js');
const requestUtils = require('../utils/request.js');

function createRuntime() {
  const storage = new Map();
  const app = {
    globalData: {
      apiBaseUrl: 'https://api.example.test',
      enableWechatAuth: true,
      allowHeaderAuthFallback: false,
      authSession: null
    }
  };

  globalThis.getApp = () => app;
  globalThis.wx = {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key)
  };

  return { app, storage };
}

export async function runAuthBootstrapSelfcheck() {
  assert.equal(auth.normalizeRole('SYSTEM-ADMIN'), 'system_admin');
  assert.deepEqual(
    new Set(auth.getUserRoles({ primaryRole: 'owner', roles: ['customer', 'staff', 'owner'] })),
    new Set(['customer', 'staff', 'owner'])
  );
  assert.equal(auth.hasUserRole({ role: 'STAFF' }, 'customer'), true);
  assert.equal(auth.hasUserRole({ primaryRole: 'system_admin' }, 'staff'), true);
  assert.equal(auth.getPrimaryRole({ role: 'staff', roles: ['customer', 'owner'] }), 'owner');
  assert.equal(auth.hasPermission({ permissions: ['staff:manage'] }, 'STAFF:MANAGE'), true);

  assert.equal(
    bootstrap.resolveLaunchTarget({ user: { primaryRole: 'customer' } }),
    '/pages/home/index'
  );
  assert.equal(
    bootstrap.resolveLaunchTarget({ user: { primaryRole: 'owner' } }),
    '/pages/home/index'
  );
  assert.equal(
    bootstrap.resolveLaunchTarget({
      user: { primaryRole: 'customer' },
      pageOptions: { redirect: '/pages/gallery-detail/index?id=gallery-1' }
    }),
    '/pages/gallery-detail/index?id=gallery-1'
  );
  assert.equal(
    bootstrap.resolveLaunchTarget({
      user: { primaryRole: 'customer' },
      pageOptions: { redirect: '/pages/staff/rules/index' }
    }),
    '/pages/home/index'
  );
  assert.equal(
    bootstrap.resolveLaunchTarget({
      user: { primaryRole: 'customer' },
      pageOptions: {
        redirect: '/pages/staff/members/index?mode=redeem&code=invite-code'
      }
    }),
    '/pages/staff/members/index?mode=redeem&code=invite-code'
  );
  assert.equal(
    bootstrap.resolveLaunchTarget({
      user: { primaryRole: 'system_admin' },
      pageOptions: { redirect: 'https://invalid.example.test' }
    }),
    '/pages/home/index'
  );
  assert.equal(
    bootstrap.resolveLaunchTarget({
      user: { primaryRole: 'customer' },
      launchOptions: { path: 'pages/bootstrap/index', scene: 'target=pages/gallery-list/index' }
    }),
    '/pages/gallery-list/index'
  );
  assert.equal(
    bootstrap.resolveLaunchTarget({
      user: { primaryRole: 'customer' },
      launchOptions: { path: 'pages/bootstrap/index', scene: 'campaign-2026' }
    }),
    '/pages/home/index?scene=campaign-2026'
  );
  assert.equal(
    bootstrap.resolveLaunchTarget({
      user: { primaryRole: 'owner' },
      isDevelop: true
    }),
    '/pages/home/index'
  );

  const runtime = createRuntime();
  auth.setAppContext(runtime.app);
  assert.equal(auth.getAppContext(), runtime.app);
  const { storage } = runtime;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  storage.set(auth.STORAGE_KEY, {
    token: 'cached-token',
    expiresAt,
    user: {
      id: 'user-1',
      role: 'customer',
      permissions: ['stale:permission'],
      staffRole: 'staff',
      systemRole: 'user'
    }
  });
  globalThis.wx.request = (options) => {
    assert.equal(options.url, 'https://api.example.test/api/v1/auth/me');
    assert.equal(options.header.Authorization, 'Bearer cached-token');
    options.success({
      statusCode: 200,
      data: {
        user: {
          id: 'user-1',
          primaryRole: 'owner',
          roles: ['customer', 'staff', 'owner'],
          permissions: ['staff:manage'],
          staffRole: 'owner',
          systemRole: 'user'
        }
      }
    });
  };

  const validatedSession = await auth.ensureAuthSession({ validate: true });
  assert.equal(validatedSession.token, 'cached-token');
  assert.equal(validatedSession.expiresAt, expiresAt);
  assert.equal(validatedSession.user.primaryRole, 'owner');
  assert.deepEqual(validatedSession.user.permissions, ['staff:manage']);
  assert.equal(validatedSession.user.role, undefined);
  assert.equal(validatedSession.user.staffRole, 'owner');

  const customerSession = auth.updateCurrentUser({
    id: 'user-1',
    role: 'customer',
    primaryRole: 'customer',
    roles: ['customer'],
    permissions: [],
    systemRole: 'user'
  });
  assert.equal(customerSession.user.staffRole, undefined);
  assert.equal(customerSession.user.systemRole, 'user');

  let protectedRequestCount = 0;
  let loginCount = 0;
  storage.set(auth.STORAGE_KEY, {
    token: 'expired-token',
    expiresAt,
    user: { primaryRole: 'customer', roles: ['customer'] }
  });
  globalThis.wx.login = (options) => {
    loginCount += 1;
    options.success({ code: 'fresh-code' });
  };
  globalThis.wx.request = (options) => {
    protectedRequestCount += 1;
    assert.equal(options.header.Authorization, 'Bearer expired-token');
    options.success({
      statusCode: 401,
      data: { code: 'SESSION_UNAUTHORIZED', error: 'Session unauthorized' }
    });
  };

  await assert.rejects(
    requestUtils.request({ url: '/protected', auth: 'customer' }),
    (error) => error && error.code === 'LOGIN_REQUIRED' && error.isLoginRequired
  );
  assert.equal(loginCount, 0);
  assert.equal(protectedRequestCount, 1);
  assert.equal(storage.has(auth.STORAGE_KEY), false, 'expired bearer must be cleared without relogin');

  storage.clear();
  await assert.rejects(
    requestUtils.request({ url: '/protected', auth: 'customer' }),
    (error) => error && error.code === 'LOGIN_REQUIRED' && error.isLoginRequired
  );
  assert.equal(protectedRequestCount, 1, 'missing session must not issue a protected request');

  globalThis.wx.login = (options) => options.success({ code: 'phone-login-code' });
  globalThis.wx.request = (options) => {
    assert.equal(options.url, 'https://api.example.test/api/v1/auth/wechat-login');
    assert.equal(options.data.code, 'phone-login-code');
    assert.equal(options.data.phoneCode, 'phone-authorize-code');
    options.success({
      statusCode: 200,
      data: {
        token: 'phone-token',
        expiresAt,
        user: { primaryRole: 'customer', roles: ['customer'], phone: '13800000000' }
      }
    });
  };

  const phoneSession = await auth.loginWithPhoneCode('phone-authorize-code');
  assert.equal(phoneSession.token, 'phone-token');
  assert.equal(phoneSession.user.phone, '13800000000');
}

const isDirectRun = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  await runAuthBootstrapSelfcheck();
  console.log('weapp auth/bootstrap self-check passed');
}
