import fs from 'node:fs';
import path from 'node:path';

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

function scanLegacyTokens(dirPath) {
  const scanExtensions = new Set(['.js', '.json', '.wxml']);
  const tokens = ['/api/v1/staff/rules', 'bookingEnabled', 'bookingNotice'];

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
expectIncludes(requestText, "getCustomerIdentityOrThrow", requestPath);

const appointmentServicePath = 'apps/weapp/services/appointment.js';
const appointmentServiceText = readText(appointmentServicePath);
const getAvailabilityBody = getFunctionBody(appointmentServiceText, 'getAvailability');
const createAppointmentBody = getFunctionBody(appointmentServiceText, 'createAppointment');
const listMyAppointmentsBody = getFunctionBody(appointmentServiceText, 'listMyAppointments');
const listStaffRulesBody = getFunctionBody(appointmentServiceText, 'listStaffRules');
const updateStaffRulesBody = getFunctionBody(appointmentServiceText, 'updateStaffRules');

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

expectIncludes(listMyAppointmentsBody, "/api/v1/my/appointments", `${appointmentServicePath}#listMyAppointments`);
expectRegex(
  listMyAppointmentsBody,
  /auth:\s*'customer'/,
  `${appointmentServicePath}#listMyAppointments`,
  'must use customer auth'
);
expectExcludes(listMyAppointmentsBody, 'phone', `${appointmentServicePath}#listMyAppointments`);
expectExcludes(appointmentServiceText, "url: '/api/v1/appointments',\n    auth: 'customer'", appointmentServicePath);

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

const bookingPagePath = 'apps/weapp/pages/booking/index.js';
const bookingPageText = readText(bookingPagePath);
expectRegex(
  bookingPageText,
  /createAppointment\(\{[\s\S]*appointmentDate:\s*dateOption\.value[\s\S]*timeSlot:\s*timeSlotOption\.value[\s\S]*\}\)/,
  bookingPagePath,
  'must submit appointmentDate + timeSlot when creating appointments'
);
['serviceId', 'serviceName', 'artistId', 'artistName'].forEach((token) => {
  expectExcludes(bookingPageText, `${token}:`, bookingPagePath);
});

const myBookingsPagePath = 'apps/weapp/pages/my-bookings/index.js';
const myBookingsPageText = readText(myBookingsPagePath);
expectIncludes(myBookingsPageText, 'listMyAppointments', myBookingsPagePath);
expectExcludes(myBookingsPageText, '/api/v1/appointments', myBookingsPagePath);
expectExcludes(myBookingsPageText, 'phone=', myBookingsPagePath);
['confirmed', 'cancelled', 'completed'].forEach((token) => {
  expectExcludes(myBookingsPageText, `'${token}'`, myBookingsPagePath);
});
expectIncludes(myBookingsPageText, "approved", myBookingsPagePath);
expectIncludes(myBookingsPageText, "rejected", myBookingsPagePath);

const staffAppointmentsPagePath = 'apps/weapp/pages/staff/appointments/index.js';
const staffAppointmentsPageText = readText(staffAppointmentsPagePath);
['confirmed', 'cancelled', 'completed'].forEach((token) => {
  expectExcludes(staffAppointmentsPageText, `'${token}'`, staffAppointmentsPagePath);
});
expectIncludes(staffAppointmentsPageText, "'approved'", staffAppointmentsPagePath);
expectIncludes(staffAppointmentsPageText, "'rejected'", staffAppointmentsPagePath);
expectExcludes(staffAppointmentsPageText, "status: 'confirmed'", `${staffAppointmentsPagePath}#reviewAppointment`);
expectExcludes(staffAppointmentsPageText, "status: 'cancelled'", `${staffAppointmentsPagePath}#reviewAppointment`);

const staffAppointmentsWxmlPath = 'apps/weapp/pages/staff/appointments/index.wxml';
const staffAppointmentsWxmlText = readText(staffAppointmentsWxmlPath);
['confirm', '确认预约', '待确认'].forEach((token) => {
  expectExcludes(staffAppointmentsWxmlText, token, staffAppointmentsWxmlPath);
});
expectIncludes(staffAppointmentsWxmlText, '通过预约', staffAppointmentsWxmlPath);
expectIncludes(staffAppointmentsWxmlText, '待审核', staffAppointmentsWxmlPath);

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

const appJsonPath = 'apps/weapp/app.json';
const appJson = JSON.parse(readText(appJsonPath) || '{}');
const requiredPages = [
  'pages/home/index',
  'pages/booking/index',
  'pages/my-bookings/index',
  'pages/staff/rules/index',
  'pages/staff/appointments/index'
];
requiredPages.forEach((page) => {
  if (!Array.isArray(appJson.pages) || !appJson.pages.includes(page)) {
    issues.push(`${appJsonPath}: missing required page ${page}`);
  }
});

scanLegacyTokens(resolveWorkspacePath('apps/weapp'));

if (issues.length) {
  console.error(issues.join('\n'));
  process.exit(1);
}

console.log('weapp contract self-check passed');
