const auth = require('../../utils/auth');
const {
  hasCustomerAccess,
  goToLogin,
  promptForLogin,
  hasStaffAccess
} = require('../../utils/login-guard');

function getRoleLabel(user) {
  if (auth.hasUserRole(user, 'system_admin')) return '系统管理员';
  if (auth.hasUserRole(user, 'owner')) return '店主';
  if (auth.hasUserRole(user, 'staff')) return '店员';
  return '顾客';
}

Page({
  data: {
    isLoggedIn: false,
    userName: '',
    roleLabel: '',
    showAdminEntry: false
  },

  async onShow() {
    this.syncState();
    this.syncTabBar();
    await this.refreshSession();
    this.syncState();
  },

  syncTabBar() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && typeof tabBar.syncSelected === 'function') {
      tabBar.syncSelected();
    }
  },

  syncState() {
    const app = getApp();
    const session = app.refreshAuthSession ? app.refreshAuthSession() : app.globalData.authSession;
    const user = session && session.user || auth.getCurrentUser() || {};
    const isLoggedIn = hasCustomerAccess();
    this.setData({
      isLoggedIn,
      userName: isLoggedIn ? (user.displayName || '微信用户') : '',
      roleLabel: isLoggedIn ? getRoleLabel(user) : '',
      showAdminEntry: isLoggedIn && hasStaffAccess()
    });
  },

  async refreshSession() {
    const app = getApp();
    const session = auth.getStoredAuthSession();
    if (!session || !app.globalData.enableWechatAuth || !app.restoreAuthSession) {
      return;
    }
    try {
      await app.restoreAuthSession({ validate: true });
    } catch (_error) {
      // A transient network failure keeps the cached session available. The
      // server remains the final authority for protected requests.
    }
  },

  goLogin() {
    goToLogin({ redirect: '/pages/my/index' });
  },

  goMyBookings() {
    if (!hasCustomerAccess()) {
      promptForLogin({
        redirect: '/pages/my-bookings/index',
        content: '查看我的预约需要使用微信登录。'
      });
      return;
    }
    wx.navigateTo({ url: '/pages/my-bookings/index' });
  },

  goMyInspirations() {
    if (!hasCustomerAccess()) {
      promptForLogin({
        redirect: '/pages/my-inspirations/index',
        content: '查看我的灵感需要使用微信登录。'
      });
      return;
    }
    wx.navigateTo({ url: '/pages/my-inspirations/index' });
  },

  goAdmin() {
    if (!this.data.showAdminEntry) {
      return;
    }
    wx.navigateTo({ url: '/pages/staff/appointments/index' });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后仍可浏览返图和可预约时间。',
      confirmText: '退出',
      confirmColor: '#e8856c',
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        await getApp().logoutAuthSession();
        this.syncState();
        wx.showToast({ title: '已退出登录', icon: 'success' });
      }
    });
  }
});
