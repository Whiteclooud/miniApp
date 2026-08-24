const { hasUserRole } = require('./auth');

const BOOTSTRAP_PATH = 'pages/bootstrap/index';
const CUSTOMER_HOME = '/pages/home/index';
const STAFF_HOME = '/pages/staff/appointments/index';

const CUSTOMER_PATHS = new Set([
  'pages/home/index',
  'pages/gallery-list/index',
  'pages/gallery-detail/index',
  'pages/booking/index',
  'pages/my-bookings/index',
  'pages/my-inspirations/index'
]);

const STAFF_PATHS = new Set([
  'pages/staff/rules/index',
  'pages/staff/gallery/index',
  'pages/staff/appointments/index',
  'pages/staff/members/index'
]);

function decodeRoute(value) {
  const text = `${value || ''}`.trim();
  if (!text) {
    return '';
  }

  try {
    return decodeURIComponent(text);
  } catch (_error) {
    return text;
  }
}

function normalizeRouteUrl(value) {
  const decoded = decodeRoute(value);
  if (!decoded || decoded.includes('\\') || decoded.includes('#')) {
    return null;
  }

  const route = decoded.startsWith('/') ? decoded.slice(1) : decoded;
  const [path] = route.split('?');
  if (!path || path === BOOTSTRAP_PATH || path.includes('..')) {
    return null;
  }

  if (!CUSTOMER_PATHS.has(path) && !STAFF_PATHS.has(path)) {
    return null;
  }

  return {
    path,
    url: `/${route}`
  };
}

function getSceneTarget(scene) {
  const decoded = decodeRoute(scene);
  if (!decoded) {
    return '';
  }

  if (decoded.startsWith('/pages/') || decoded.startsWith('pages/')) {
    return decoded;
  }

  const pairs = decoded.split('&');
  for (const pair of pairs) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = pair.slice(0, separatorIndex);
    if (key === 'target' || key === 'redirect') {
      return decodeRoute(pair.slice(separatorIndex + 1));
    }
  }

  return '';
}

function getRequestedTarget(launchOptions = {}, pageOptions = {}) {
  const launchQuery = launchOptions.query || {};
  return pageOptions.redirect ||
    pageOptions.target ||
    launchQuery.redirect ||
    launchQuery.target ||
    (launchOptions.path && launchOptions.path !== BOOTSTRAP_PATH ? launchOptions.path : '') ||
    getSceneTarget(pageOptions.scene || launchQuery.scene || launchOptions.scene);
}

function isInvitationRedeemTarget(route) {
  return route.path === 'pages/staff/members/index' && /(?:^|[?&])mode=redeem(?:&|$)/.test(route.url);
}

function resolveDefaultHome(user) {
  return hasUserRole(user, 'staff') ? STAFF_HOME : CUSTOMER_HOME;
}

function appendSceneContext(url, launchOptions = {}, pageOptions = {}) {
  const query = launchOptions.query || {};
  const scene = pageOptions.scene || query.scene || launchOptions.scene;
  if (!scene || getRequestedTarget(launchOptions, pageOptions)) {
    return url;
  }

  return `${url}${url.includes('?') ? '&' : '?'}scene=${encodeURIComponent(scene)}`;
}

function resolveLaunchTarget({ user, isDevelop = false, launchOptions = {}, pageOptions = {} } = {}) {
  if (isDevelop) {
    return CUSTOMER_HOME;
  }

  const requestedRoute = normalizeRouteUrl(getRequestedTarget(launchOptions, pageOptions));
  if (!requestedRoute) {
    return appendSceneContext(resolveDefaultHome(user), launchOptions, pageOptions);
  }

  if (CUSTOMER_PATHS.has(requestedRoute.path) || isInvitationRedeemTarget(requestedRoute)) {
    return requestedRoute.url;
  }

  if (STAFF_PATHS.has(requestedRoute.path) && hasUserRole(user, 'staff')) {
    return requestedRoute.url;
  }

  return resolveDefaultHome(user);
}

module.exports = {
  BOOTSTRAP_PATH,
  CUSTOMER_HOME,
  STAFF_HOME,
  normalizeRouteUrl,
  resolveDefaultHome,
  resolveLaunchTarget
};
