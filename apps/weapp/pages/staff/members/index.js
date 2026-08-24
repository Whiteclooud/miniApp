const {
  listStaffMembers,
  removeStaffMember,
  listStaffInvitations,
  createStaffInvitation,
  revokeStaffInvitation,
  redeemStaffInvitation
} = require('../../../services/staff-management');
const auth = require('../../../utils/auth');
const { getErrorMessage } = require('../../../utils/request');

const INVITATION_ROLE_OPTIONS = [
  { value: 'staff', label: '店员' },
  { value: 'owner', label: '店主' }
];
const INVITATION_DURATION_OPTIONS = [
  { value: 24, label: '24 小时' },
  { value: 72, label: '3 天' },
  { value: 168, label: '7 天' },
  { value: 336, label: '14 天' }
];

function normalizeRole(value) {
  return `${value || ''}`.trim().toLowerCase().replace(/-/g, '_');
}

function getUserRoles(user = {}) {
  if (typeof auth.getUserRoles === 'function') {
    return auth.getUserRoles(user).map(normalizeRole);
  }

  const values = [user.primaryRole, user.role, user.staffRole, ...(user.roles || [])];
  return Array.from(new Set(values.map(normalizeRole).filter(Boolean)));
}

function getUserPermissions(user = {}) {
  if (typeof auth.hasPermission === 'function') {
    return [
      auth.hasPermission(user, 'staff:manage') ? 'staff:manage' : '',
      auth.hasPermission(user, 'staff:manage:owners') ? 'staff:manage:owners' : ''
    ].filter(Boolean);
  }
  if (Array.isArray(user.permissions)) {
    return user.permissions.map((item) => `${item || ''}`.trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

function getManagementAccess(user) {
  const currentUser = user || {};
  const roles = getUserRoles(currentUser);
  const permissions = getUserPermissions(currentUser);
  const isSystemAdmin = roles.includes('system_admin');
  const isOwner = roles.includes('owner');
  const canManageStaff = isSystemAdmin || isOwner || permissions.includes('staff:manage');

  return {
    currentUserId: currentUser.id || '',
    isSystemAdmin,
    isOwner,
    canManageStaff,
    canManageOwners: isSystemAdmin || permissions.includes('staff:manage:owners'),
    roleLabel: isSystemAdmin ? '系统管理员' : isOwner ? '店主' : '店员'
  };
}

function formatDate(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return `${value}`;
  }
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function maskOpenId(openId) {
  const value = `${openId || ''}`.trim();
  if (!value) {
    return '未记录微信标识';
  }
  if (value.length <= 12) {
    return `${value.slice(0, 3)}***${value.slice(-2)}`;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function roleLabel(role) {
  const labels = {
    owner: '店主',
    staff: '店员',
    system_admin: '系统管理员'
  };
  return labels[normalizeRole(role)] || '店员';
}

function statusLabel(status) {
  const labels = {
    active: '在职',
    disabled: '已停用',
    pending: '待使用',
    redeemed: '已使用',
    revoked: '已撤销',
    expired: '已过期'
  };
  return labels[normalizeRole(status)] || status || '-';
}

function normalizeMember(item = {}, access = {}) {
  const role = normalizeRole(item.role) || 'staff';
  const status = normalizeRole(item.status) || 'active';
  const isSelf = !!(
    access.currentUserId && item.userId && access.currentUserId === item.userId
  );
  const canRemoveRole = access.isSystemAdmin ? ['owner', 'staff'].includes(role) : role === 'staff';

  return {
    ...item,
    id: item.id || '',
    userId: item.userId || '',
    displayName: item.displayName || maskOpenId(item.openId),
    maskedOpenId: maskOpenId(item.openId),
    role,
    roleText: roleLabel(role),
    status,
    statusText: statusLabel(status),
    joinedAtText: formatDate(item.createdAt),
    isSelf,
    canRemove: status === 'active' && !isSelf && canRemoveRole
  };
}

function normalizeInvitation(item = {}, now = Date.now()) {
  const expiresAtTime = item.expiresAt ? new Date(item.expiresAt).getTime() : 0;
  const rawStatus = normalizeRole(item.status) || 'pending';
  const status = rawStatus === 'pending' && expiresAtTime && expiresAtTime <= now
    ? 'expired'
    : rawStatus;
  const createdBy = item.createdBy || {};
  const redeemedBy = item.redeemedBy || {};

  return {
    ...item,
    id: item.id || '',
    role: normalizeRole(item.role) || 'staff',
    roleText: roleLabel(item.role),
    status,
    statusText: statusLabel(status),
    expiresAtText: formatDate(item.expiresAt),
    createdAtText: formatDate(item.createdAt),
    createdByText: createdBy.displayName || maskOpenId(createdBy.openId),
    redeemedByText: redeemedBy.displayName || maskOpenId(redeemedBy.openId),
    canRevoke: status === 'pending'
  };
}

function invitationErrorMessage(error, fallback) {
  const code = `${error && error.code || ''}`.trim().toUpperCase();
  const messages = {
    INVALID_INVITATION_CODE: '邀请码格式不正确，请核对后重试。',
    INVALID_INVITATION_EXPIRY: '邀请码有效期不符合要求。',
    INVALID_STAFF_ROLE: '成员角色不符合要求。',
    INVITATION_NOT_FOUND: '邀请码不存在，请核对后重试。',
    INVITATION_EXPIRED: '邀请码已过期，请联系店主重新创建。',
    INVITATION_REDEEMED: '邀请码已被使用。',
    INVITATION_ALREADY_REDEEMED: '邀请码已被使用。',
    INVITATION_REVOKED: '邀请码已被撤销。',
    MEMBER_ALREADY_ACTIVE: '当前账号已经是有效成员，无需重复加入。',
    CANNOT_DISABLE_SELF: '不能移除当前登录账号自己的权限。',
    STAFF_MEMBER_NOT_FOUND: '成员不存在或已被移除。',
    PERMISSION_DENIED: '当前账号没有成员管理权限。',
    LAST_ACTIVE_OWNER: '不能移除最后一位在职店主。'
  };
  return messages[code] || getErrorMessage(error, fallback || '操作失败，请稍后重试。');
}

function showConfirmation(options = {}) {
  return new Promise((resolve) => {
    wx.showModal({
      title: options.title || '确认操作',
      content: options.content || '',
      confirmText: options.confirmText || '确认',
      confirmColor: options.confirmColor || '#d45a5a',
      success: (result) => resolve(!!result.confirm),
      fail: () => resolve(false)
    });
  });
}

Page({
  data: {
    mode: 'manage',
    pageState: 'loading',
    stateMessage: '',
    activeSection: 'members',
    currentRoleLabel: '',
    canManageStaff: false,
    canManageOwners: false,
    canManageRules: false,
    members: [],
    invitations: [],
    activeMemberCount: 0,
    pendingInvitationCount: 0,
    deletingMemberId: '',
    revokingInvitationId: '',
    invitationRoleOptions: INVITATION_ROLE_OPTIONS.slice(0, 1),
    invitationRoleIndex: 0,
    invitationDurationOptions: INVITATION_DURATION_OPTIONS,
    invitationDurationIndex: 2,
    createState: 'idle',
    createMessage: '',
    createdInvitation: null,
    inviteCode: '',
    redeemState: 'idle',
    redeemMessage: '',
    redeemedRoleText: ''
  },

  async onLoad(options = {}) {
    const mode = options.mode === 'redeem' ? 'redeem' : 'manage';
    let inviteCode = '';
    try {
      inviteCode = decodeURIComponent(options.code || '').trim();
    } catch (_error) {
      inviteCode = `${options.code || ''}`.trim();
    }

    this.setData({ mode, inviteCode });
    if (mode === 'redeem') {
      this.setData({ pageState: 'ready' });
      return;
    }
    await this.loadData();
  },

  onShareAppMessage() {
    const code = `${this.data.createdInvitation && this.data.createdInvitation.code || ''}`.trim();
    if (!code) {
      return {
        title: '美甲预约',
        path: '/pages/home/index'
      };
    }
    return {
      title: `${this.data.createdInvitation.roleText || '成员'}邀请`,
      path: `/pages/staff/members/index?mode=redeem&code=${encodeURIComponent(code)}`
    };
  },

  onHide() {
    if (this.data.mode === 'manage' && this.data.createdInvitation) {
      this.setData({ createdInvitation: null });
    }
  },

  async onPullDownRefresh() {
    if (this.data.mode === 'manage') {
      await this.loadData();
    }
    wx.stopPullDownRefresh();
  },

  refreshAccess() {
    const access = getManagementAccess(auth.getCurrentUser());
    this.access = access;
    this.setData({
      currentRoleLabel: access.roleLabel,
      canManageStaff: access.canManageStaff,
      canManageOwners: access.canManageOwners,
      canManageRules: auth.hasPermission
        ? auth.hasPermission(auth.getCurrentUser(), 'staff:booking-rules:read')
        : false,
      invitationRoleOptions: access.canManageOwners
        ? INVITATION_ROLE_OPTIONS
        : INVITATION_ROLE_OPTIONS.slice(0, 1),
      invitationRoleIndex: access.canManageOwners ? this.data.invitationRoleIndex : 0
    });
    return access;
  },

  async loadData() {
    const access = this.refreshAccess();
    if (!access.canManageStaff) {
      this.setData({
        pageState: 'unauthorized',
        stateMessage: '当前账号没有成员管理权限。',
        members: [],
        invitations: []
      });
      return;
    }

    this.setData({ pageState: 'loading', stateMessage: '' });
    try {
      const [memberResponse, invitationResponse] = await Promise.all([
        listStaffMembers(),
        listStaffInvitations()
      ]);
      const latestAccess = this.refreshAccess();
      const members = (memberResponse.items || []).map((item) => normalizeMember(item, latestAccess));
      const invitations = (invitationResponse.items || []).map((item) => normalizeInvitation(item));
      this.setData({
        pageState: members.length || invitations.length ? 'ready' : 'empty',
        members,
        invitations,
        activeMemberCount: members.filter((item) => item.status === 'active').length,
        pendingInvitationCount: invitations.filter((item) => item.status === 'pending').length,
        stateMessage: ''
      });
    } catch (error) {
      this.setData({
        pageState: error.isUnauthorized ? 'unauthorized' : 'error',
        stateMessage: invitationErrorMessage(error, '成员资料加载失败，请稍后重试。'),
        members: [],
        invitations: []
      });
    }
  },

  showInvitationSection() {
    this.setData({
      pageState: 'ready',
      activeSection: 'invitations'
    });
  },

  switchSection(event) {
    const section = event.currentTarget.dataset.section;
    if (section === 'members' || section === 'invitations') {
      this.setData({ activeSection: section });
    }
  },

  onInvitationRoleChange(event) {
    this.setData({
      invitationRoleIndex: Number(event.detail.value || 0),
      createMessage: ''
    });
  },

  onInvitationDurationChange(event) {
    this.setData({
      invitationDurationIndex: Number(event.detail.value || 0),
      createMessage: ''
    });
  },

  async createInvitation() {
    if (this.data.createState === 'submitting') {
      return;
    }
    const roleOption = this.data.invitationRoleOptions[this.data.invitationRoleIndex];
    const durationOption = this.data.invitationDurationOptions[this.data.invitationDurationIndex];
    if (!roleOption || !durationOption) {
      return;
    }

    this.setData({
      createState: 'submitting',
      createMessage: ''
    });
    try {
      const response = await createStaffInvitation({
        role: roleOption.value,
        expiresInHours: durationOption.value
      });
      const invitation = normalizeInvitation(response.item || {});
      const code = `${response.invite && response.invite.code || response.code || ''}`.trim();
      this.setData({
        createdInvitation: {
          ...invitation,
          code,
          expiresAtText: formatDate(
            response.invite && response.invite.expiresAt || invitation.expiresAt
          )
        },
        createMessage: code ? '' : '邀请已创建，但接口没有返回可复制的邀请码。',
        invitations: [invitation, ...this.data.invitations.filter((item) => item.id !== invitation.id)],
        pendingInvitationCount: invitation.status === 'pending'
          ? this.data.pendingInvitationCount + 1
          : this.data.pendingInvitationCount,
        pageState: 'ready',
        activeSection: 'invitations'
      });
      wx.showToast({ title: '邀请已创建', icon: 'success' });
    } catch (error) {
      this.setData({
        createMessage: invitationErrorMessage(error, '邀请创建失败，请稍后重试。')
      });
    } finally {
      this.setData({ createState: 'idle' });
    }
  },

  copyInvitationCode() {
    const code = `${this.data.createdInvitation && this.data.createdInvitation.code || ''}`;
    if (!code) {
      return;
    }
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' })
    });
  },

  async confirmRemoveMember(event) {
    const memberId = event.currentTarget.dataset.id;
    const member = this.data.members.find((item) => item.id === memberId);
    if (!member || !member.canRemove || this.data.deletingMemberId) {
      return;
    }
    const shouldRemove = await showConfirmation({
      title: `移除${member.roleText}`,
      content: `确认停用“${member.displayName}”的${member.roleText}权限吗？`,
      confirmText: '确认移除'
    });
    if (!shouldRemove) {
      return;
    }

    this.setData({ deletingMemberId: memberId, stateMessage: '' });
    try {
      await removeStaffMember(memberId);
      wx.showToast({ title: '成员已移除', icon: 'success' });
      await this.loadData();
    } catch (error) {
      this.setData({ stateMessage: invitationErrorMessage(error, '成员移除失败，请稍后重试。') });
      wx.showToast({ title: '移除失败', icon: 'none' });
    } finally {
      this.setData({ deletingMemberId: '' });
    }
  },

  async confirmRevokeInvitation(event) {
    const invitationId = event.currentTarget.dataset.id;
    const invitation = this.data.invitations.find((item) => item.id === invitationId);
    if (!invitation || !invitation.canRevoke || this.data.revokingInvitationId) {
      return;
    }
    const shouldRevoke = await showConfirmation({
      title: '撤销邀请',
      content: `确认撤销这条${invitation.roleText}邀请吗？撤销后邀请码将立即失效。`,
      confirmText: '确认撤销'
    });
    if (!shouldRevoke) {
      return;
    }

    this.setData({ revokingInvitationId: invitationId, stateMessage: '' });
    try {
      await revokeStaffInvitation(invitationId);
      wx.showToast({ title: '邀请已撤销', icon: 'success' });
      await this.loadData();
    } catch (error) {
      this.setData({ stateMessage: invitationErrorMessage(error, '邀请撤销失败，请稍后重试。') });
      wx.showToast({ title: '撤销失败', icon: 'none' });
    } finally {
      this.setData({ revokingInvitationId: '' });
    }
  },

  onInviteCodeInput(event) {
    this.setData({
      inviteCode: event.detail.value,
      redeemState: 'idle',
      redeemMessage: ''
    });
  },

  async redeemInvitation() {
    const code = `${this.data.inviteCode || ''}`.trim();
    if (!code) {
      this.setData({ redeemState: 'error', redeemMessage: '请输入邀请码。' });
      return;
    }
    if (this.data.redeemState === 'submitting') {
      return;
    }

    this.setData({ redeemState: 'submitting', redeemMessage: '' });
    try {
      const response = await redeemStaffInvitation(code);
      if (response.user && typeof auth.updateCurrentUser === 'function') {
        auth.updateCurrentUser(response.user);
      }
      const role = response.item && response.item.role || response.user && (
        response.user.primaryRole || response.user.role
      );
      this.setData({
        redeemState: 'success',
        redeemMessage: '',
        redeemedRoleText: roleLabel(role)
      });
    } catch (error) {
      this.setData({
        redeemState: error.isUnauthorized ? 'unauthorized' : 'error',
        redeemMessage: invitationErrorMessage(error, '邀请码兑换失败，请稍后重试。')
      });
    }
  },

  enterStaffWorkbench() {
    wx.reLaunch({ url: '/pages/staff/appointments/index' });
  },

  goAppointments() {
    wx.redirectTo({ url: '/pages/staff/appointments/index' });
  },

  goRules() {
    wx.redirectTo({ url: '/pages/staff/rules/index' });
  },

  goGallery() {
    wx.redirectTo({ url: '/pages/staff/gallery/index' });
  }
});
