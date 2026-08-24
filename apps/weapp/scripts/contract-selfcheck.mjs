import fs from 'node:fs';
import path from 'node:path';
import { runReferenceImageLogicSelfcheck } from './reference-image-logic-selfcheck.mjs';
import { runAuthBootstrapSelfcheck } from './auth-bootstrap-selfcheck.mjs';
import { runStaffMembersLogicSelfcheck } from './staff-members-logic-selfcheck.mjs';

const workspaceDir = process.cwd();
const issues = [];

function resolveWorkspacePath(relativePath) {
  return path.resolve(workspaceDir, relativePath);
}

function readText(relativePath) {
  const fullPath = resolveWorkspacePath(relativePath);
  if (!fs.existsSync(fullPath)) {
    issues.push(`${relativePath}: file is missing`);
    return '';
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function expectIncludes(text, token, label) {
  if (!text.includes(token)) {
    issues.push(`${label}: missing ${token}`);
  }
}

function expectExcludes(text, token, label) {
  if (text.includes(token)) {
    issues.push(`${label}: should not include ${token}`);
  }
}

function expectRegex(text, regex, label, message) {
  if (!regex.test(text)) {
    issues.push(`${label}: ${message}`);
  }
}

function getFunctionBody(text, functionName) {
  const start = text.indexOf(`function ${functionName}`);
  if (start < 0) {
    return '';
  }

  const signatureEnd = text.indexOf(')', start);
  if (signatureEnd < 0) {
    return '';
  }

  const openBraceIndex = text.indexOf('{', signatureEnd);
  if (openBraceIndex < 0) {
    return '';
  }

  let depth = 0;
  for (let index = openBraceIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') {
      depth += 1;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return '';
}

function getObjectMethodBody(text, methodName) {
  let start = text.indexOf(`async ${methodName}(`);
  if (start < 0) {
    start = text.indexOf(`${methodName}(`);
  }
  if (start < 0) {
    return '';
  }

  const signatureEnd = text.indexOf(')', start);
  const openBraceIndex = signatureEnd < 0 ? -1 : text.indexOf('{', signatureEnd);
  if (openBraceIndex < 0) {
    return '';
  }

  let depth = 0;
  for (let index = openBraceIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') {
      depth += 1;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return '';
}

function scanLegacyTokens(dirPath) {
  const scanExtensions = new Set(['.js', '.json', '.wxml']);
  const tokens = ['/api/v1/staff/rules', 'bookingEnabled', 'bookingNotice', 'confirmed'];

  for (const name of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, name);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (name === 'scripts') {
        continue;
      }
      scanLegacyTokens(fullPath);
      continue;
    }

    if (!scanExtensions.has(path.extname(fullPath))) {
      continue;
    }

    const text = fs.readFileSync(fullPath, 'utf8');
    const relativePath = path.relative(workspaceDir, fullPath);
    tokens.forEach((token) => expectExcludes(text, token, relativePath));
  }
}

const requestPath = 'apps/weapp/utils/request.js';
const requestText = readText(requestPath);
expectIncludes(requestText, "'X-Customer-OpenId'", requestPath);
expectIncludes(requestText, "'X-Staff-OpenId'", requestPath);
expectIncludes(requestText, 'getCustomerIdentityOrThrow', requestPath);

const appointmentServicePath = 'apps/weapp/services/appointment.js';
const appointmentServiceText = readText(appointmentServicePath);
const listGalleryBody = getFunctionBody(appointmentServiceText, 'listGallery');
const getGalleryDetailBody = getFunctionBody(appointmentServiceText, 'getGalleryDetail');
const listMyInspirationsBody = getFunctionBody(appointmentServiceText, 'listMyInspirations');
const getMyInspirationBody = getFunctionBody(appointmentServiceText, 'getMyInspiration');
const createMyInspirationBody = getFunctionBody(appointmentServiceText, 'createMyInspiration');
const updateMyInspirationBody = getFunctionBody(appointmentServiceText, 'updateMyInspiration');
const deleteMyInspirationBody = getFunctionBody(appointmentServiceText, 'deleteMyInspiration');
const uploadCustomerReferenceImagesBody = getFunctionBody(
  appointmentServiceText,
  'uploadCustomerReferenceImages'
);
const deleteCustomerReferenceImageBody = getFunctionBody(
  appointmentServiceText,
  'deleteCustomerReferenceImage'
);
const getAvailabilityBody = getFunctionBody(appointmentServiceText, 'getAvailability');
const createAppointmentBody = getFunctionBody(appointmentServiceText, 'createAppointment');
const listMyAppointmentsBody = getFunctionBody(appointmentServiceText, 'listMyAppointments');
const listStaffRulesBody = getFunctionBody(appointmentServiceText, 'listStaffRules');
const updateStaffRulesBody = getFunctionBody(appointmentServiceText, 'updateStaffRules');
const getStaffAppointmentDetailBody = getFunctionBody(
  appointmentServiceText,
  'getStaffAppointmentDetail'
);

expectIncludes(listGalleryBody, "url: '/api/v1/gallery'", `${appointmentServicePath}#listGallery`);
expectExcludes(listGalleryBody, '/api/v1/gallery/', `${appointmentServicePath}#listGallery`);
expectIncludes(
  getGalleryDetailBody,
  'url: `/api/v1/gallery/${encodeURIComponent(itemId)}`',
  `${appointmentServicePath}#getGalleryDetail`
);
expectIncludes(
  listMyInspirationsBody,
  "url: '/api/v1/my/inspirations'",
  `${appointmentServicePath}#listMyInspirations`
);
expectIncludes(listMyInspirationsBody, "auth: 'customer'", `${appointmentServicePath}#listMyInspirations`);
expectIncludes(
  getMyInspirationBody,
  'url: `/api/v1/my/inspirations/${encodeURIComponent(inspirationId)}`',
  `${appointmentServicePath}#getMyInspiration`
);
expectIncludes(createMyInspirationBody, "method: 'POST'", `${appointmentServicePath}#createMyInspiration`);
expectIncludes(
  createMyInspirationBody,
  "url: '/api/v1/my/inspirations'",
  `${appointmentServicePath}#createMyInspiration`
);
expectIncludes(createMyInspirationBody, "auth: 'customer'", `${appointmentServicePath}#createMyInspiration`);
expectIncludes(
  updateMyInspirationBody,
  'url: `/api/v1/my/inspirations/${encodeURIComponent(inspirationId)}`',
  `${appointmentServicePath}#updateMyInspiration`
);
expectIncludes(updateMyInspirationBody, "method: 'PATCH'", `${appointmentServicePath}#updateMyInspiration`);
expectIncludes(updateMyInspirationBody, "auth: 'customer'", `${appointmentServicePath}#updateMyInspiration`);
expectIncludes(
  deleteMyInspirationBody,
  'url: `/api/v1/my/inspirations/${encodeURIComponent(inspirationId)}`',
  `${appointmentServicePath}#deleteMyInspiration`
);
expectIncludes(deleteMyInspirationBody, "method: 'DELETE'", `${appointmentServicePath}#deleteMyInspiration`);
expectIncludes(deleteMyInspirationBody, "auth: 'customer'", `${appointmentServicePath}#deleteMyInspiration`);
expectIncludes(
  uploadCustomerReferenceImagesBody,
  'filePaths: [filePath]',
  `${appointmentServicePath}#uploadCustomerReferenceImages`
);
expectIncludes(
  uploadCustomerReferenceImagesBody,
  'uploadError.uploadedItems = uploadedItems.slice()',
  `${appointmentServicePath}#uploadCustomerReferenceImages`
);
expectIncludes(
  deleteCustomerReferenceImageBody,
  'getCustomerReferenceImageFilename(imageUrl)',
  `${appointmentServicePath}#deleteCustomerReferenceImage`
);
expectIncludes(
  deleteCustomerReferenceImageBody,
  'url: `/api/v1/uploads/images/${encodeURIComponent(filename)}`',
  `${appointmentServicePath}#deleteCustomerReferenceImage`
);
expectIncludes(
  deleteCustomerReferenceImageBody,
  "method: 'DELETE'",
  `${appointmentServicePath}#deleteCustomerReferenceImage`
);
expectIncludes(
  deleteCustomerReferenceImageBody,
  "auth: 'customer'",
  `${appointmentServicePath}#deleteCustomerReferenceImage`
);
expectIncludes(appointmentServiceText, "url: '/api/v1/availability'", appointmentServicePath);
expectRegex(
  getAvailabilityBody,
  /params:\s*date\s*\?\s*\{\s*date\s*\}\s*:\s*undefined/,
  `${appointmentServicePath}#getAvailability`,
  'must call availability with query key date'
);
expectExcludes(getAvailabilityBody, 'month', `${appointmentServicePath}#getAvailability`);
expectExcludes(getAvailabilityBody, 'appointmentDate', `${appointmentServicePath}#getAvailability`);

expectRegex(
  createAppointmentBody,
  /url:\s*'\/api\/v1\/appointments'/,
  `${appointmentServicePath}#createAppointment`,
  'must post to /api/v1/appointments'
);
expectRegex(
  createAppointmentBody,
  /method:\s*'POST'/,
  `${appointmentServicePath}#createAppointment`,
  'must use POST'
);
expectRegex(
  createAppointmentBody,
  /auth:\s*'customer'/,
  `${appointmentServicePath}#createAppointment`,
  'must use customer auth'
);
expectIncludes(createAppointmentBody, 'appointmentDate', `${appointmentServicePath}#createAppointment`);
['serviceId', 'serviceName', 'artistId', 'artistName', 'date:'].forEach((token) => {
  expectExcludes(createAppointmentBody, token, `${appointmentServicePath}#createAppointment`);
});

expectIncludes(listMyAppointmentsBody, '/api/v1/my/appointments', `${appointmentServicePath}#listMyAppointments`);
expectRegex(
  listMyAppointmentsBody,
  /auth:\s*'customer'/,
  `${appointmentServicePath}#listMyAppointments`,
  'must use customer auth'
);
expectExcludes(listMyAppointmentsBody, 'phone', `${appointmentServicePath}#listMyAppointments`);

expectIncludes(listStaffRulesBody, '/api/v1/staff/booking-rules', `${appointmentServicePath}#listStaffRules`);
expectRegex(
  listStaffRulesBody,
  /auth:\s*'staff'/,
  `${appointmentServicePath}#listStaffRules`,
  'must use staff auth'
);
expectIncludes(updateStaffRulesBody, '/api/v1/staff/booking-rules', `${appointmentServicePath}#updateStaffRules`);
expectRegex(
  updateStaffRulesBody,
  /method:\s*'PUT'/,
  `${appointmentServicePath}#updateStaffRules`,
  'must use PUT'
);
expectRegex(
  updateStaffRulesBody,
  /auth:\s*'staff'/,
  `${appointmentServicePath}#updateStaffRules`,
  'must use staff auth'
);
expectExcludes(appointmentServiceText, '/api/v1/staff/rules', appointmentServicePath);
expectIncludes(
  getStaffAppointmentDetailBody,
  'url: `/api/v1/staff/appointments/${encodeURIComponent(appointmentId)}`',
  `${appointmentServicePath}#getStaffAppointmentDetail`
);
expectIncludes(
  getStaffAppointmentDetailBody,
  "auth: 'staff'",
  `${appointmentServicePath}#getStaffAppointmentDetail`
);

const staffIdentityPath = 'apps/weapp/utils/staff.js';
const staffIdentityText = readText(staffIdentityPath);
expectIncludes(staffIdentityText, 'getCurrentUser', staffIdentityPath);
expectIncludes(staffIdentityText, "source: 'session-pending'", staffIdentityPath);

const customerIdentityPath = 'apps/weapp/utils/customer.js';
const customerIdentityText = readText(customerIdentityPath);
expectIncludes(customerIdentityText, 'getCurrentUser', customerIdentityPath);
expectIncludes(customerIdentityText, "source: 'session-pending'", customerIdentityPath);

const appJsPath = 'apps/weapp/app.js';
const appJsText = readText(appJsPath);
expectIncludes(appJsText, "apiBaseUrl: 'http://127.0.0.1:3100'", appJsPath);
expectIncludes(appJsText, "key: 'api'", appJsPath);
expectRegex(
  readText('apps/weapp/app.json'),
  /"pages\/staff\/members\/index"/,
  'apps/weapp/app.json',
  'must register the staff members page'
);
expectRegex(
  appJsText,
  /^(?![\s\S]*require\(['"]\.\/pages\/)[\s\S]*$/,
  appJsPath,
  'must not require page entry modules; app.json owns page registration'
);
expectExcludes(appJsText, '127.0.0.1:3000', appJsPath);
expectExcludes(appJsText, 'apps/server', appJsPath);

const apiProfilePath = 'apps/weapp/utils/api-profile.js';
const apiProfileText = readText(apiProfilePath);
expectIncludes(apiProfileText, "const DEFAULT_PROFILE = 'api'", apiProfilePath);
expectRegex(
  apiProfileText,
  /baseUrl:\s*'http:\/\/[^']+:3100'/,
  apiProfilePath,
  'must point api profile to an apps/api server on port 3100'
);
expectIncludes(apiProfileText, 'allowHeaderAuthFallback: true', apiProfilePath);
expectRegex(
  apiProfileText,
  /trial:\s*\{[\s\S]*?baseUrl:\s*'https:\/\/[^']+'[\s\S]*?enableWechatAuth:\s*true[\s\S]*?allowHeaderAuthFallback:\s*false/,
  apiProfilePath,
  'trial profile must use HTTPS WeChat auth without header fallback'
);
expectRegex(
  apiProfileText,
  /release:\s*\{[\s\S]*?baseUrl:\s*'https:\/\/[^']+'[\s\S]*?enableWechatAuth:\s*true[\s\S]*?allowHeaderAuthFallback:\s*false/,
  apiProfilePath,
  'release profile must use HTTPS WeChat auth without header fallback'
);
expectIncludes(apiProfileText, "envVersion === 'trial'", apiProfilePath);
expectIncludes(apiProfileText, "envVersion === 'release'", apiProfilePath);
expectIncludes(
  apiProfileText,
  'allowHeaderAuthFallback: !!profile.allowHeaderAuthFallback',
  apiProfilePath
);
expectExcludes(apiProfileText, 'apps/server', apiProfilePath);
expectExcludes(apiProfileText, '127.0.0.1:3000', apiProfilePath);
expectExcludes(apiProfileText, "'legacy'", apiProfilePath);

const homePagePath = 'apps/weapp/pages/home/index.js';
const homePageText = readText(homePagePath);
const homeLoadDataBody = getObjectMethodBody(homePageText, 'loadData');
expectIncludes(homePageText, 'goGalleryDetail', homePagePath);
expectIncludes(homePageText, 'goGalleryList', homePagePath);
expectIncludes(homePageText, '/pages/gallery-detail/index?id=', homePagePath);
expectIncludes(homePageText, '/pages/gallery-list/index', homePagePath);
expectIncludes(homePageText, 'normalizeGalleryItems', homePagePath);
expectIncludes(homeLoadDataBody, 'listGallery({ limit: 1 })', `${homePagePath}#loadData`);
expectIncludes(homeLoadDataBody, '.slice(0, 1)', `${homePagePath}#loadData`);
expectExcludes(homeLoadDataBody, 'limit: 3', `${homePagePath}#loadData`);
expectExcludes(homePageText, 'switchToLegacyProfile', homePagePath);
expectExcludes(homePageText, 'applyApiProfile', homePagePath);

const homeWxmlPath = 'apps/weapp/pages/home/index.wxml';
const homeWxmlText = readText(homeWxmlPath);
expectIncludes(homeWxmlText, '返图灵感', homeWxmlPath);
expectIncludes(homeWxmlText, '查看全部', homeWxmlPath);
expectExcludes(homeWxmlText, 'apps/server', homeWxmlPath);
expectExcludes(homeWxmlText, '当前接口基线', homeWxmlPath);
expectExcludes(homeWxmlText, '当前执行口径', homeWxmlPath);
expectExcludes(homeWxmlText, '开发环境切流开关', homeWxmlPath);
expectExcludes(homeWxmlText, '切到 apps/api', homeWxmlPath);
expectExcludes(homeWxmlText, '使用 apps/server', homeWxmlPath);
expectExcludes(homeWxmlText, '恢复默认基线', homeWxmlPath);

const galleryDetailPagePath = 'apps/weapp/pages/gallery-detail/index.js';
const galleryDetailPageText = readText(galleryDetailPagePath);
expectIncludes(galleryDetailPageText, 'getGalleryDetail', galleryDetailPagePath);
expectIncludes(galleryDetailPageText, 'normalizeGalleryItem', galleryDetailPagePath);
expectIncludes(galleryDetailPageText, 'GALLERY_ITEM_NOT_FOUND', galleryDetailPagePath);
expectIncludes(galleryDetailPageText, 'referenceImageUrl=', galleryDetailPagePath);
expectIncludes(galleryDetailPageText, 'createMyInspiration', galleryDetailPagePath);
expectIncludes(galleryDetailPageText, 'saveToInspirations', galleryDetailPagePath);
expectExcludes(galleryDetailPageText, 'listGallery', galleryDetailPagePath);
expectExcludes(galleryDetailPageText, 'styleNote', galleryDetailPagePath);
expectExcludes(galleryDetailPageText, '/api/v1/gallery/', galleryDetailPagePath);

const galleryListPagePath = 'apps/weapp/pages/gallery-list/index.js';
const galleryListPageText = readText(galleryListPagePath);
expectIncludes(galleryListPageText, 'GALLERY_FILTERS', galleryListPagePath);
expectIncludes(galleryListPageText, 'onFilterTap', galleryListPagePath);
expectIncludes(galleryListPageText, "{ tag: this.data.activeTag }", galleryListPagePath);

const galleryListWxmlPath = 'apps/weapp/pages/gallery-list/index.wxml';
const galleryListWxmlText = readText(galleryListWxmlPath);
expectIncludes(galleryListWxmlText, 'bindtap="onFilterTap"', galleryListWxmlPath);
expectIncludes(galleryListWxmlText, "activeTag === item.tag", galleryListWxmlPath);

const galleryUtilsPath = 'apps/weapp/utils/gallery.js';
const galleryUtilsText = readText(galleryUtilsPath);
expectIncludes(galleryUtilsText, 'item.imageUrls', galleryUtilsPath);
expectIncludes(galleryUtilsText, 'item.imageUrl', galleryUtilsPath);
expectIncludes(galleryUtilsText, 'const coverImageUrl = item.imageUrl || imageUrls[0] ||', galleryUtilsPath);

const referenceImagesUtilsPath = 'apps/weapp/utils/reference-images.js';
const referenceImagesUtilsText = readText(referenceImagesUtilsPath);
expectIncludes(
  referenceImagesUtilsText,
  "const CUSTOMER_UPLOAD_PATH_PREFIX = '/api/v1/uploads/images/'",
  referenceImagesUtilsPath
);
expectIncludes(referenceImagesUtilsText, 'getCustomerReferenceImageFilename', referenceImagesUtilsPath);
expectIncludes(referenceImagesUtilsText, 'isCustomerReferenceImageUrl', referenceImagesUtilsPath);

const bookingPagePath = 'apps/weapp/pages/booking/index.js';
const bookingPageText = readText(bookingPagePath);
const addReferenceImagesBody = getObjectMethodBody(bookingPageText, 'addReferenceImages');
const removeReferenceImageBody = getObjectMethodBody(bookingPageText, 'removeReferenceImage');
const submitBody = getObjectMethodBody(bookingPageText, 'submit');
expectIncludes(bookingPageText, 'normalizeTimeSlotStatus', bookingPagePath);
expectIncludes(bookingPageText, 'calendarDays', bookingPagePath);
expectIncludes(bookingPageText, 'calendarWeeks', bookingPagePath);
expectIncludes(bookingPageText, 'changeMonth', bookingPagePath);
expectIncludes(bookingPageText, 'onCalendarDayTap', bookingPagePath);
expectIncludes(bookingPageText, 'reasonText', bookingPagePath);
expectIncludes(bookingPageText, 'selectedTimeSlotValue', bookingPagePath);
expectIncludes(bookingPageText, 'onTimeSlotTap', bookingPagePath);
expectIncludes(bookingPageText, "status !== 'active'", bookingPagePath);
expectIncludes(bookingPageText, 'getTimeSlotReasonText', bookingPagePath);
expectIncludes(bookingPageText, 'uploadCustomerReferenceImages', bookingPagePath);
expectIncludes(bookingPageText, 'referenceImageUrls', bookingPagePath);
expectIncludes(bookingPageText, 'removeReferenceImage', bookingPagePath);
expectIncludes(bookingPageText, 'previewReferenceImage', bookingPagePath);
expectIncludes(bookingPageText, 'deleteCustomerReferenceImage', bookingPagePath);
expectIncludes(bookingPageText, 'isCustomerReferenceImageUrl', bookingPagePath);
expectIncludes(addReferenceImagesBody, "this.data.submitState !== 'idle'", `${bookingPagePath}#addReferenceImages`);
expectIncludes(addReferenceImagesBody, 'error && error.uploadedItems', `${bookingPagePath}#addReferenceImages`);
expectIncludes(addReferenceImagesBody, 'cleanupUploadedReferenceImages', `${bookingPagePath}#addReferenceImages`);
expectIncludes(removeReferenceImageBody, "this.data.submitState !== 'idle'", `${bookingPagePath}#removeReferenceImage`);
expectIncludes(removeReferenceImageBody, "referenceImageState: 'deleting'", `${bookingPagePath}#removeReferenceImage`);
expectIncludes(removeReferenceImageBody, 'await deleteCustomerReferenceImage(imageUrl)', `${bookingPagePath}#removeReferenceImage`);
expectIncludes(removeReferenceImageBody, "error.code === 'CUSTOMER_UPLOAD_NOT_FOUND'", `${bookingPagePath}#removeReferenceImage`);
expectIncludes(removeReferenceImageBody, '图片已保留', `${bookingPagePath}#removeReferenceImage`);
expectIncludes(submitBody, "referenceImageState !== 'idle'", `${bookingPagePath}#submit`);
expectExcludes(submitBody, 'deleteCustomerReferenceImage', `${bookingPagePath}#submit`);
expectExcludes(bookingPageText, 'styleNote', bookingPagePath);
expectRegex(
  bookingPageText,
  /createAppointment\(\{[\s\S]*appointmentDate:\s*availability\.selectedDate[\s\S]*timeSlot:\s*timeSlotOption\.value[\s\S]*\}\)/,
  bookingPagePath,
  'must submit appointmentDate + timeSlot when creating appointments'
);
['serviceId', 'serviceName', 'artistId', 'artistName'].forEach((token) => {
  expectExcludes(bookingPageText, `${token}:`, bookingPagePath);
});

const bookingWxmlPath = 'apps/weapp/pages/booking/index.wxml';
const bookingWxmlText = readText(bookingWxmlPath);
expectIncludes(bookingWxmlText, 'calendarWeeks', bookingWxmlPath);
expectIncludes(bookingWxmlText, 'bindtap="onCalendarDayTap"', bookingWxmlPath);
expectIncludes(bookingWxmlText, 'time-slot-grid', bookingWxmlPath);
expectIncludes(bookingWxmlText, 'bindtap="onTimeSlotTap"', bookingWxmlPath);
expectIncludes(bookingWxmlText, 'item.reasonText || item.reasonCode', bookingWxmlPath);
expectIncludes(bookingWxmlText, 'bindtap="addReferenceImages"', bookingWxmlPath);
expectIncludes(bookingWxmlText, 'catchtap="removeReferenceImage"', bookingWxmlPath);
expectIncludes(bookingWxmlText, 'bindtap="previewReferenceImage"', bookingWxmlPath);
expectIncludes(
  bookingWxmlText,
  "wx:if=\"{{submitState === 'idle' && referenceImageState === 'idle'}}\"",
  `${bookingWxmlPath}#removeReferenceImage`
);
expectIncludes(
  bookingWxmlText,
  "referenceImageUrls.length < maxReferenceImageCount && submitState === 'idle' && referenceImageState === 'idle'",
  `${bookingWxmlPath}#addReferenceImages`
);
expectIncludes(
  bookingWxmlText,
  "disabled=\"{{submitState === 'submitting' || referenceImageState !== 'idle'}}\"",
  bookingWxmlPath
);
expectExcludes(bookingWxmlText, 'picker mode="selector" range="{{timeSlotOptions}}"', bookingWxmlPath);

const bookingWxssPath = 'apps/weapp/pages/booking/index.wxss';
const bookingWxssText = readText(bookingWxssPath);
expectIncludes(bookingWxssText, '.calendar-card', bookingWxssPath);
expectIncludes(bookingWxssText, '.calendar-cell', bookingWxssPath);
expectIncludes(bookingWxssText, '.time-slot-grid', bookingWxssPath);
expectIncludes(bookingWxssText, '.time-slot-card.is-disabled', bookingWxssPath);
expectIncludes(bookingWxssText, '.time-slot-card.is-selected', bookingWxssPath);
expectIncludes(bookingWxssText, '.reference-image-grid', bookingWxssPath);
expectIncludes(bookingWxssText, '.reference-image-remove', bookingWxssPath);

const myBookingsPagePath = 'apps/weapp/pages/my-bookings/index.js';
const myBookingsPageText = readText(myBookingsPagePath);
expectIncludes(myBookingsPageText, 'listMyAppointments', myBookingsPagePath);
expectExcludes(myBookingsPageText, '/api/v1/appointments', myBookingsPagePath);
expectExcludes(myBookingsPageText, 'phone=', myBookingsPagePath);
['confirmed'].forEach((token) => {
  expectExcludes(myBookingsPageText, `'${token}'`, myBookingsPagePath);
});
expectIncludes(myBookingsPageText, 'approved', myBookingsPagePath);
expectIncludes(myBookingsPageText, 'rejected', myBookingsPagePath);
expectIncludes(myBookingsPageText, 'cancelled', myBookingsPagePath);
expectIncludes(myBookingsPageText, 'completed', myBookingsPagePath);
expectIncludes(myBookingsPageText, 'referenceImageUrls', myBookingsPagePath);
expectIncludes(myBookingsPageText, 'previewReferenceImage', myBookingsPagePath);

const staffAppointmentsPagePath = 'apps/weapp/pages/staff/appointments/index.js';
const staffAppointmentsPageText = readText(staffAppointmentsPagePath);
['confirmed'].forEach((token) => {
  expectExcludes(staffAppointmentsPageText, `'${token}'`, staffAppointmentsPagePath);
});
expectIncludes(staffAppointmentsPageText, "'approved'", staffAppointmentsPagePath);
expectIncludes(staffAppointmentsPageText, "'rejected'", staffAppointmentsPagePath);
expectIncludes(staffAppointmentsPageText, "'cancelled'", staffAppointmentsPagePath);
expectIncludes(staffAppointmentsPageText, "'completed'", staffAppointmentsPagePath);
expectIncludes(staffAppointmentsPageText, "'no_show'", staffAppointmentsPagePath);
expectIncludes(staffAppointmentsPageText, 'goGallery', staffAppointmentsPagePath);
expectIncludes(staffAppointmentsPageText, 'reviewHint', staffAppointmentsPagePath);
expectIncludes(staffAppointmentsPageText, 'showApproveAction', staffAppointmentsPagePath);
expectIncludes(staffAppointmentsPageText, 'showRejectAction', staffAppointmentsPagePath);
expectIncludes(staffAppointmentsPageText, 'activeListFilter', staffAppointmentsPagePath);
expectIncludes(staffAppointmentsPageText, 'detailFilters', staffAppointmentsPagePath);
expectIncludes(staffAppointmentsPageText, 'onDetailFilterTap', staffAppointmentsPagePath);
expectIncludes(staffAppointmentsPageText, 'buildCalendarState', staffAppointmentsPagePath);
expectIncludes(staffAppointmentsPageText, 'historyAppointments', staffAppointmentsPagePath);
expectIncludes(staffAppointmentsPageText, 'referenceImageUrls', staffAppointmentsPagePath);
expectIncludes(staffAppointmentsPageText, 'previewReferenceImage', staffAppointmentsPagePath);
expectRegex(
  staffAppointmentsPageText,
  /const response = await listStaffAppointments\(\);/,
  `${staffAppointmentsPagePath}#loadData`,
  'must request staff appointments without status by default'
);
expectRegex(
  staffAppointmentsPageText,
  /listStaffAppointments\(\{\s*status:\s*nextFilterKey\s*\}\)/,
  `${staffAppointmentsPagePath}#loadDetailList`,
  'must request staff appointments with explicit status when user filters'
);

const staffAppointmentsWxmlPath = 'apps/weapp/pages/staff/appointments/index.wxml';
const staffAppointmentsWxmlText = readText(staffAppointmentsWxmlPath);
['confirm', '确认预约', '待确认'].forEach((token) => {
  expectExcludes(staffAppointmentsWxmlText, token, staffAppointmentsWxmlPath);
});
expectIncludes(staffAppointmentsWxmlText, 'approveActionText', staffAppointmentsWxmlPath);
expectIncludes(staffAppointmentsWxmlText, 'rejectActionText', staffAppointmentsWxmlPath);
expectIncludes(staffAppointmentsWxmlText, '待审核', staffAppointmentsWxmlPath);
expectIncludes(staffAppointmentsWxmlText, 'bindtap="onDetailFilterTap"', staffAppointmentsWxmlPath);
expectIncludes(staffAppointmentsWxmlText, 'detail-filter-chip', staffAppointmentsWxmlPath);
expectIncludes(staffAppointmentsWxmlText, 'url="/pages/staff/members/index"', staffAppointmentsWxmlPath);

const staffRulesPagePath = 'apps/weapp/pages/staff/rules/index.js';
const staffRulesPageText = readText(staffRulesPagePath);
['bookingEnabled', 'bookingNotice', 'timeSlots:'].forEach((token) => {
  expectExcludes(staffRulesPageText, token, staffRulesPagePath);
});
expectRegex(
  staffRulesPageText,
  /function\s+buildSubmitPayload\s*\([^)]*\)\s*\{[\s\S]*advanceOpenDays[\s\S]*dailySlots[\s\S]*closedDates[\s\S]*\}/,
  staffRulesPagePath,
  'must submit advanceOpenDays + dailySlots + closedDates'
);

expectIncludes(galleryListPageText, 'listGallery', galleryListPagePath);
expectIncludes(galleryListPageText, 'goGalleryDetail', galleryListPagePath);

const myInspirationsPagePath = 'apps/weapp/pages/my-inspirations/index.js';
const myInspirationsPageText = readText(myInspirationsPagePath);
expectIncludes(myInspirationsPageText, 'listMyInspirations', myInspirationsPagePath);
expectIncludes(myInspirationsPageText, 'getMyInspiration', myInspirationsPagePath);
expectIncludes(myInspirationsPageText, 'updateMyInspiration', myInspirationsPagePath);
expectIncludes(myInspirationsPageText, 'deleteMyInspiration', myInspirationsPagePath);
expectIncludes(myInspirationsPageText, 'pageInfo.nextCursor', myInspirationsPagePath);
expectIncludes(myInspirationsPageText, "availability: item.availability === 'available'", myInspirationsPagePath);
expectRegex(myInspirationsPageText, /galleryItem:[\s\S]*?: null,/, myInspirationsPagePath, 'must preserve unavailable galleryItem as null');

const staffGalleryPagePath = 'apps/weapp/pages/staff/gallery/index.js';
const staffGalleryPageText = readText(staffGalleryPagePath);
expectIncludes(staffGalleryPageText, 'uploadStaffGalleryImages', staffGalleryPagePath);
expectIncludes(staffGalleryPageText, 'createStaffGallery', staffGalleryPagePath);
expectIncludes(staffGalleryPageText, 'updateStaffGallery', staffGalleryPagePath);
expectIncludes(staffGalleryPageText, "publishedAt = `${form.publishDate}T${form.publishTime}:00`", staffGalleryPagePath);
expectIncludes(staffGalleryPageText, "status: form.status === 'inactive' ? 'inactive' : 'active'", staffGalleryPagePath);

const staffGalleryServicePath = 'apps/weapp/services/appointment.js';
const getStaffGalleryDetailBody = getFunctionBody(appointmentServiceText, 'getStaffGalleryDetail');
const deleteStaffGalleryBody = getFunctionBody(appointmentServiceText, 'deleteStaffGallery');
expectIncludes(
  getStaffGalleryDetailBody,
  'url: `/api/v1/staff/gallery/${encodeURIComponent(itemId)}`',
  `${staffGalleryServicePath}#getStaffGalleryDetail`
);
expectIncludes(
  getStaffGalleryDetailBody,
  "auth: 'staff'",
  `${staffGalleryServicePath}#getStaffGalleryDetail`
);
expectIncludes(
  deleteStaffGalleryBody,
  'url: `/api/v1/staff/gallery/${encodeURIComponent(itemId)}`',
  `${staffGalleryServicePath}#deleteStaffGallery`
);
expectIncludes(
  deleteStaffGalleryBody,
  "method: 'DELETE'",
  `${staffGalleryServicePath}#deleteStaffGallery`
);
expectIncludes(
  deleteStaffGalleryBody,
  "auth: 'staff'",
  `${staffGalleryServicePath}#deleteStaffGallery`
);

const staffManagementServicePath = 'apps/weapp/services/staff-management.js';
const staffManagementServiceText = readText(staffManagementServicePath);
const listStaffMembersBody = getFunctionBody(staffManagementServiceText, 'listStaffMembers');
const removeStaffMemberBody = getFunctionBody(staffManagementServiceText, 'removeStaffMember');
const listStaffInvitationsBody = getFunctionBody(staffManagementServiceText, 'listStaffInvitations');
const createStaffInvitationBody = getFunctionBody(staffManagementServiceText, 'createStaffInvitation');
const revokeStaffInvitationBody = getFunctionBody(staffManagementServiceText, 'revokeStaffInvitation');
const redeemStaffInvitationBody = getFunctionBody(staffManagementServiceText, 'redeemStaffInvitation');
expectIncludes(listStaffMembersBody, "url: '/api/v1/staff/members'", `${staffManagementServicePath}#listStaffMembers`);
expectIncludes(listStaffMembersBody, "auth: 'staff'", `${staffManagementServicePath}#listStaffMembers`);
expectIncludes(
  removeStaffMemberBody,
  'url: `/api/v1/staff/members/${encodeURIComponent(memberId)}`',
  `${staffManagementServicePath}#removeStaffMember`
);
expectIncludes(removeStaffMemberBody, "method: 'DELETE'", `${staffManagementServicePath}#removeStaffMember`);
expectIncludes(
  listStaffInvitationsBody,
  "url: '/api/v1/staff/invitations'",
  `${staffManagementServicePath}#listStaffInvitations`
);
expectIncludes(createStaffInvitationBody, "method: 'POST'", `${staffManagementServicePath}#createStaffInvitation`);
expectIncludes(createStaffInvitationBody, "auth: 'staff'", `${staffManagementServicePath}#createStaffInvitation`);
expectIncludes(
  revokeStaffInvitationBody,
  'url: `/api/v1/staff/invitations/${encodeURIComponent(invitationId)}`',
  `${staffManagementServicePath}#revokeStaffInvitation`
);
expectIncludes(
  revokeStaffInvitationBody,
  "method: 'DELETE'",
  `${staffManagementServicePath}#revokeStaffInvitation`
);
expectIncludes(
  redeemStaffInvitationBody,
  "url: '/api/v1/staff/invitations/redeem'",
  `${staffManagementServicePath}#redeemStaffInvitation`
);
expectIncludes(redeemStaffInvitationBody, "method: 'POST'", `${staffManagementServicePath}#redeemStaffInvitation`);
expectIncludes(redeemStaffInvitationBody, "auth: 'customer'", `${staffManagementServicePath}#redeemStaffInvitation`);

const staffMembersPagePath = 'apps/weapp/pages/staff/members/index.js';
const staffMembersPageText = readText(staffMembersPagePath);
const staffMembersWxmlPath = 'apps/weapp/pages/staff/members/index.wxml';
const staffMembersWxmlText = readText(staffMembersWxmlPath);
expectIncludes(staffMembersPageText, "options.mode === 'redeem'", staffMembersPagePath);
expectIncludes(staffMembersPageText, 'auth.updateCurrentUser(response.user)', staffMembersPagePath);
expectIncludes(staffMembersPageText, "auth.hasPermission(user, 'staff:manage')", staffMembersPagePath);
expectIncludes(staffMembersPageText, 'onShareAppMessage()', staffMembersPagePath);
expectIncludes(
  staffMembersPageText,
  '/pages/staff/members/index?mode=redeem&code=${encodeURIComponent(code)}',
  staffMembersPagePath
);
expectIncludes(staffMembersWxmlText, 'open-type="share"', staffMembersWxmlPath);
expectIncludes(staffMembersWxmlText, 'pageState === \'unauthorized\'', staffMembersWxmlPath);
expectIncludes(staffMembersWxmlText, 'pageState === \'error\'', staffMembersWxmlPath);
expectIncludes(staffMembersWxmlText, 'members.length', staffMembersWxmlPath);
expectIncludes(staffMembersWxmlText, 'invitations.length', staffMembersWxmlPath);

const appJsonPath = 'apps/weapp/app.json';
const appJson = JSON.parse(readText(appJsonPath) || '{}');
const requiredPages = [
  'pages/home/index',
  'pages/gallery-list/index',
  'pages/gallery-detail/index',
  'pages/booking/index',
  'pages/my-bookings/index',
  'pages/my-inspirations/index',
  'pages/staff/rules/index',
  'pages/staff/gallery/index',
  'pages/staff/appointments/index',
  'pages/staff/members/index'
];
requiredPages.forEach((page) => {
  if (!Array.isArray(appJson.pages) || !appJson.pages.includes(page)) {
    issues.push(`${appJsonPath}: missing required page ${page}`);
  }
});

[
  'project.config.json',
  'apps/weapp/project.config.json'
].forEach((projectConfigPath) => {
  const projectConfig = JSON.parse(readText(projectConfigPath) || '{}');
  if (!projectConfig.setting || projectConfig.setting.ignoreDevUnusedFiles !== false) {
    issues.push(`${projectConfigPath}: unused-file filtering must stay disabled`);
  }
  const forcedIncludes = projectConfig.packOptions && projectConfig.packOptions.include;
  if (Array.isArray(forcedIncludes) && forcedIncludes.length) {
    issues.push(`${projectConfigPath}: pages must be registered in app.json, not packOptions.include`);
  }
});

[
  'project.private.config.json',
  'apps/weapp/project.private.config.json'
].forEach((privateConfigPath) => {
  const privateConfig = JSON.parse(readText(privateConfigPath) || '{}');
  if (!privateConfig.setting || privateConfig.setting.compileHotReLoad !== false) {
    issues.push(`${privateConfigPath}: hot reload must stay disabled to avoid stale page graphs`);
  }
});

scanLegacyTokens(resolveWorkspacePath('apps/weapp'));

try {
  await runReferenceImageLogicSelfcheck();
} catch (error) {
  issues.push(`reference image logic self-check failed: ${error.stack || error.message || error}`);
}

try {
  await runAuthBootstrapSelfcheck();
} catch (error) {
  issues.push(`auth/bootstrap self-check failed: ${error.stack || error.message || error}`);
}

try {
  await runStaffMembersLogicSelfcheck();
} catch (error) {
  issues.push(`staff members logic self-check failed: ${error.stack || error.message || error}`);
}

if (issues.length) {
  console.error(issues.join('\n'));
  process.exit(1);
}

console.log('weapp contract self-check passed');
