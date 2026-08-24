import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);

function installModuleMock(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
    children: [],
    paths: []
  };
}

function restoreModule(modulePath, originalModule) {
  delete require.cache[modulePath];
  if (originalModule) {
    require.cache[modulePath] = originalModule;
  }
}

function createPageInstance(definition) {
  const instance = {
    ...definition,
    data: JSON.parse(JSON.stringify(definition.data))
  };
  instance.setData = (changes = {}) => Object.assign(instance.data, changes);
  return instance;
}

export async function runStaffMembersLogicSelfcheck() {
  const requestPath = require.resolve('../utils/request.js');
  const authPath = require.resolve('../utils/auth.js');
  const servicePath = require.resolve('../services/staff-management.js');
  const pagePath = require.resolve('../pages/staff/members/index.js');
  const originals = new Map([
    [requestPath, require.cache[requestPath]],
    [authPath, require.cache[authPath]],
    [servicePath, require.cache[servicePath]],
    [pagePath, require.cache[pagePath]]
  ]);
  const previousPage = globalThis.Page;
  const previousWx = globalThis.wx;
  const calls = [];
  let currentUser = {
    id: 'user-staff',
    primaryRole: 'staff',
    roles: ['customer', 'staff'],
    permissions: []
  };
  let updatedUser = null;
  let definition;

  try {
    installModuleMock(requestPath, {
      getErrorMessage: (error, fallback) => error && error.message || fallback
    });
    installModuleMock(authPath, {
      getCurrentUser: () => currentUser,
      getUserRoles: (user) => user.roles || [],
      hasPermission: (user, permission) => (
        user.primaryRole === 'system_admin' || (user.permissions || []).includes(permission)
      ),
      updateCurrentUser: (user) => {
        updatedUser = user;
        currentUser = user;
      }
    });
    installModuleMock(servicePath, {
      listStaffMembers: async () => {
        calls.push('members');
        return { items: [] };
      },
      removeStaffMember: async () => ({}),
      listStaffInvitations: async () => {
        calls.push('invitations');
        return {
          items: [{
            id: 'expired-invitation',
            role: 'staff',
            status: 'pending',
            expiresAt: '2020-01-01T00:00:00.000Z'
          }]
        };
      },
      createStaffInvitation: async () => ({
        item: {
          id: 'invitation-1',
          role: 'staff',
          status: 'pending',
          expiresAt: '2026-08-28T08:00:00.000Z'
        },
        invite: {
          code: 'INVITE-CODE',
          expiresAt: '2026-08-28T08:00:00.000Z'
        }
      }),
      revokeStaffInvitation: async () => ({}),
      redeemStaffInvitation: async () => ({
        item: { role: 'staff' },
        user: {
          id: 'user-staff',
          primaryRole: 'staff',
          roles: ['customer', 'staff'],
          permissions: ['staff:appointments:read']
        }
      })
    });
    globalThis.wx = {
      showToast: () => {},
      showModal: () => {},
      setClipboardData: () => {}
    };
    globalThis.Page = (pageDefinition) => {
      definition = pageDefinition;
    };
    delete require.cache[pagePath];
    require(pagePath);
    assert.ok(definition, 'staff members page must register');

    let page = createPageInstance(definition);
    await page.onLoad({});
    assert.equal(page.data.pageState, 'unauthorized');
    assert.deepEqual(calls, [], 'plain staff must not issue management requests');

    currentUser = {
      id: 'user-owner',
      primaryRole: 'owner',
      roles: ['customer', 'staff', 'owner'],
      permissions: ['staff:manage', 'staff:booking-rules:read']
    };
    page = createPageInstance(definition);
    await page.onLoad({});
    assert.equal(page.data.pageState, 'ready');
    assert.deepEqual(calls, ['members', 'invitations']);
    assert.equal(page.data.invitationRoleOptions.length, 1, 'owner cannot invite another owner');
    assert.equal(page.data.invitations[0].status, 'expired');
    assert.equal(page.data.pendingInvitationCount, 0);

    await page.createInvitation();
    assert.equal(page.data.createdInvitation.code, 'INVITE-CODE');
    assert.equal(
      page.onShareAppMessage().path,
      '/pages/staff/members/index?mode=redeem&code=INVITE-CODE'
    );

    page = createPageInstance(definition);
    await page.onLoad({ mode: 'redeem', code: 'INVITE-CODE' });
    assert.equal(page.data.inviteCode, 'INVITE-CODE');
    await page.redeemInvitation();
    assert.equal(page.data.redeemState, 'success');
    assert.equal(updatedUser.primaryRole, 'staff');
  } finally {
    originals.forEach((originalModule, modulePath) => restoreModule(modulePath, originalModule));
    globalThis.Page = previousPage;
    globalThis.wx = previousWx;
  }
}

const isDirectRun = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  await runStaffMembersLogicSelfcheck();
  console.log('staff members logic self-check passed');
}
