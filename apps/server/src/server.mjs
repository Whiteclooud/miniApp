import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';

import { createSqliteStorage, resolveDefaultDbPath } from './storage/sqlite.mjs';

const port = Number(process.env.PORT || 3000);

const staffOpenIds = String(process.env.STAFF_OPEN_IDS || 'staff-openid-demo')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Staff-OpenId',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS'
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, error, code, extra = {}) {
  sendJson(res, statusCode, {
    error,
    ...(code ? { code } : {}),
    ...extra
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatMonth(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isValidMonthString(value) {
  return /^\d{4}-\d{2}$/.test(value);
}

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTimeString(value) {
  return /^\d{2}:\d{2}$/.test(value);
}

function parseMinutes(value) {
  if (!isValidTimeString(value)) {
    return Number.NaN;
  }
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function slotValue(slot) {
  return `${slot.start}-${slot.end}`;
}

function compareSlots(a, b) {
  return parseMinutes(a.start) - parseMinutes(b.start);
}

function validateDailySlots(dailySlots) {
  if (!Array.isArray(dailySlots) || dailySlots.length === 0) {
    return 'dailySlots must be a non-empty array';
  }

  const normalized = dailySlots.map((slot) => ({
    start: String(slot?.start || ''),
    end: String(slot?.end || '')
  }));

  for (const slot of normalized) {
    if (!isValidTimeString(slot.start) || !isValidTimeString(slot.end)) {
      return 'Invalid slot time format';
    }
    if (parseMinutes(slot.start) >= parseMinutes(slot.end)) {
      return 'Slot start must be earlier than end';
    }
  }

  normalized.sort(compareSlots);
  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    if (parseMinutes(current.start) < parseMinutes(previous.end)) {
      return 'Slots must not overlap';
    }
  }

  return null;
}

function getMonthDayCount(month) {
  const [year, monthValue] = month.split('-').map(Number);
  return new Date(year, monthValue, 0).getDate();
}

function getMinBookableDate(rule, nowProvider) {
  return formatDate(addDays(nowProvider(), rule.advanceOpenDays));
}

function isSlotOccupied(approvedAppointments, date, timeSlot, ignoreId = null) {
  return approvedAppointments.some(
    (item) => item.id !== ignoreId && item.appointmentDate === date && item.timeSlot === timeSlot
  );
}

function buildDayAvailability({ date, rule, approvedAppointments, nowProvider }) {
  const isClosed = rule.closedDates.includes(date);
  const isInOpenWindow = date >= getMinBookableDate(rule, nowProvider);
  const baseSlots = rule.dailySlots.map((slot) => {
    const value = slotValue(slot);
    return {
      label: value,
      value,
      bookable: !isClosed && isInOpenWindow && !isSlotOccupied(approvedAppointments, date, value)
    };
  });

  if (isClosed || !isInOpenWindow) {
    return {
      date,
      bookable: false,
      slots: []
    };
  }

  return {
    date,
    bookable: baseSlots.some((slot) => slot.bookable),
    slots: baseSlots
  };
}

function sortAppointmentsDesc(list) {
  return [...list].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function requireStaff(req, res) {
  const openId = String(req.headers['x-staff-openid'] || '').trim();
  if (!openId || !staffOpenIds.includes(openId)) {
    sendError(res, 401, 'Staff unauthorized', 'STAFF_UNAUTHORIZED');
    return false;
  }
  return true;
}

function createApp({ storage, nowProvider = () => new Date() }) {
  function getRuleOrThrow() {
    const rule = storage.getBookingRule();
    if (!rule) {
      throw new Error('Booking rule missing');
    }
    return rule;
  }

  function isValidBookableSlot({ date, timeSlot, rule, approvedAppointments }) {
    if (!isValidDateString(date)) {
      return false;
    }
    const day = buildDayAvailability({
      date,
      rule,
      approvedAppointments,
      nowProvider
    });
    return day.bookable && day.slots.some((slot) => slot.value === timeSlot && slot.bookable);
  }

  async function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        service: 'miniapp-server',
        timestamp: nowProvider().toISOString()
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/gallery') {
      sendJson(res, 200, { items: storage.listGalleryItems() });
      return;
    }

    if (url.pathname.startsWith('/api/v1/staff/')) {
      if (!requireStaff(req, res)) {
        return;
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/staff/booking-rules') {
      sendJson(res, 200, { item: getRuleOrThrow() });
      return;
    }

    if (req.method === 'PUT' && url.pathname === '/api/v1/staff/booking-rules') {
      try {
        const body = await readJson(req);
        const { advanceOpenDays, closedDates, dailySlots } = body;

        if (!Number.isInteger(advanceOpenDays) || advanceOpenDays < 0) {
          sendError(res, 400, 'Invalid advanceOpenDays', 'INVALID_RULES');
          return;
        }

        if (!Array.isArray(closedDates) || closedDates.some((item) => !isValidDateString(String(item)))) {
          sendError(res, 400, 'Invalid closedDates', 'INVALID_RULES');
          return;
        }

        const slotError = validateDailySlots(dailySlots);
        if (slotError) {
          sendError(res, 400, slotError, 'INVALID_RULES');
          return;
        }

        const saved = storage.saveBookingRule({
          id: 'rule-default',
          advanceOpenDays,
          closedDates: [...new Set(closedDates.map(String))].sort(),
          dailySlots: [...dailySlots].map((slot) => ({
            start: String(slot.start),
            end: String(slot.end)
          })).sort(compareSlots),
          updatedAt: nowProvider().toISOString()
        });

        sendJson(res, 200, { item: saved });
        return;
      } catch (error) {
        sendError(res, 400, error.message || 'Bad request');
        return;
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/availability') {
      const month = url.searchParams.get('month') || formatMonth(nowProvider());
      if (!isValidMonthString(month)) {
        sendError(res, 400, 'Invalid month', 'INVALID_MONTH');
        return;
      }

      const rule = getRuleOrThrow();
      const approvedAppointments = storage.listApprovedAppointments();
      const totalDays = getMonthDayCount(month);
      const days = [];
      for (let day = 1; day <= totalDays; day += 1) {
        const date = `${month}-${pad(day)}`;
        days.push(buildDayAvailability({
          date,
          rule,
          approvedAppointments,
          nowProvider
        }));
      }

      sendJson(res, 200, {
        month,
        advanceOpenDays: rule.advanceOpenDays,
        closedDates: rule.closedDates,
        days
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/appointments') {
      try {
        const body = await readJson(req);
        const required = ['customerName', 'phone', 'appointmentDate', 'timeSlot'];
        const missing = required.filter((field) => !body[field]);

        if (missing.length > 0) {
          sendJson(res, 400, {
            error: 'Missing required fields',
            missing
          });
          return;
        }

        const rule = getRuleOrThrow();
        const approvedAppointments = storage.listApprovedAppointments();
        if (
          !isValidBookableSlot({
            date: String(body.appointmentDate),
            timeSlot: String(body.timeSlot),
            rule,
            approvedAppointments
          })
        ) {
          sendError(res, 400, 'Invalid appointment slot', 'INVALID_SLOT');
          return;
        }

        const item = storage.createAppointment({
          customerName: String(body.customerName),
          phone: String(body.phone),
          appointmentDate: String(body.appointmentDate),
          timeSlot: String(body.timeSlot),
          note: String(body.note || ''),
          createdAt: nowProvider().toISOString()
        });

        sendJson(res, 201, { item });
        return;
      } catch (error) {
        sendError(res, 400, error.message || 'Bad request');
        return;
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/my/appointments') {
      const phone = String(url.searchParams.get('phone') || '').trim();
      if (!phone) {
        sendError(res, 400, 'Missing phone', 'MISSING_PHONE');
        return;
      }

      const items = sortAppointmentsDesc(storage.listAppointments({ phone }));
      sendJson(res, 200, { items });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/v1/staff/appointments') {
      const status = String(url.searchParams.get('status') || '').trim();
      const items = sortAppointmentsDesc(storage.listAppointments({ status: status || undefined }));
      sendJson(res, 200, { items });
      return;
    }

    const reviewMatch = url.pathname.match(/^\/api\/v1\/staff\/appointments\/([^/]+)\/review$/);
    if (req.method === 'POST' && reviewMatch) {
      try {
        const appointmentId = reviewMatch[1];
        const target = storage.getAppointmentById(appointmentId);
        if (!target) {
          sendError(res, 404, 'Appointment not found', 'NOT_FOUND');
          return;
        }

        if (target.status !== 'pending') {
          sendError(res, 409, 'Appointment already reviewed', 'ALREADY_REVIEWED');
          return;
        }

        const body = await readJson(req);
        const action = String(body.action || '').trim();
        if (!['approve', 'reject'].includes(action)) {
          sendError(res, 400, 'Invalid review action', 'INVALID_ACTION');
          return;
        }

        if (
          action === 'approve' &&
          isSlotOccupied(storage.listApprovedAppointments(), target.appointmentDate, target.timeSlot, target.id)
        ) {
          sendError(res, 409, 'Slot already occupied', 'SLOT_OCCUPIED');
          return;
        }

        const reviewedAt = nowProvider().toISOString();
        const updated = storage.updateAppointmentReview({
          id: target.id,
          status: action === 'approve' ? 'approved' : 'rejected',
          reviewNote: String(body.reviewNote || ''),
          reviewedAt
        });

        sendJson(res, 200, {
          item: {
            id: updated.id,
            status: updated.status,
            reviewNote: updated.reviewNote,
            reviewedAt: updated.reviewedAt
          }
        });
        return;
      } catch (error) {
        sendError(res, 400, error.message || 'Bad request');
        return;
      }
    }

    sendError(res, 404, 'Not found', 'NOT_FOUND', {
      path: url.pathname
    });
  }

  return {
    handleRequest
  };
}

async function startTestServer(app) {
  const server = http.createServer((req, res) => {
    app.handleRequest(req, res).catch((error) => {
      sendError(res, 500, error.message || 'Internal server error');
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Self test failed: server address unavailable');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function requestJson(baseUrl, path, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  return {
    statusCode: response.status,
    body: text,
    json: text ? JSON.parse(text) : null
  };
}

async function runSelfTest() {
  const tempDir = mkdtempSync(join(os.tmpdir(), 'miniapp-server-'));
  const dbPath = join(tempDir, 'self-test.sqlite');
  const fixedNow = () => new Date('2026-03-13T00:00:00.000Z');
  const staffHeaders = {
    'x-staff-openid': 'staff-openid-demo',
    'content-type': 'application/json'
  };

  try {
    const storageA = createSqliteStorage({ dbPath });
    storageA.init();
    const appA = createApp({ storage: storageA, nowProvider: fixedNow });
    const testServerA = await startTestServer(appA);

    const healthRes = await requestJson(testServerA.baseUrl, '/health');
    if (healthRes.statusCode !== 200 || !healthRes.json?.ok) {
      throw new Error('Self test failed: /health did not return ok=true');
    }

    const galleryRes = await requestJson(testServerA.baseUrl, '/api/v1/gallery');
    if (galleryRes.statusCode !== 200 || !Array.isArray(galleryRes.json?.items) || galleryRes.json.items.length === 0) {
      throw new Error('Self test failed: /api/v1/gallery did not return seeded items');
    }

    const rulesRes = await requestJson(testServerA.baseUrl, '/api/v1/staff/booking-rules', {
      headers: staffHeaders
    });
    if (rulesRes.statusCode !== 200 || rulesRes.json?.item?.id !== 'rule-default') {
      throw new Error('Self test failed: /api/v1/staff/booking-rules did not return default rule');
    }

    const updateRulesRes = await requestJson(testServerA.baseUrl, '/api/v1/staff/booking-rules', {
      method: 'PUT',
      headers: staffHeaders,
      body: {
        advanceOpenDays: 1,
        closedDates: ['2026-03-20'],
        dailySlots: [
          { start: '09:30', end: '10:30' },
          { start: '11:00', end: '12:00' }
        ]
      }
    });
    if (updateRulesRes.statusCode !== 200 || updateRulesRes.json?.item?.advanceOpenDays !== 1) {
      throw new Error('Self test failed: booking rules update did not persist');
    }

    const createAppointmentRes = await requestJson(testServerA.baseUrl, '/api/v1/appointments', {
      method: 'POST',
      headers: staffHeaders,
      body: {
        customerName: 'Tester',
        phone: '13900000000',
        appointmentDate: '2026-03-14',
        timeSlot: '09:30-10:30',
        note: 'SQLite persistence check'
      }
    });
    if (createAppointmentRes.statusCode !== 201 || createAppointmentRes.json?.item?.status !== 'pending') {
      throw new Error('Self test failed: appointment creation did not return pending record');
    }

    const appointmentId = createAppointmentRes.json.item.id;
    const reviewRes = await requestJson(testServerA.baseUrl, `/api/v1/staff/appointments/${appointmentId}/review`, {
      method: 'POST',
      headers: staffHeaders,
      body: {
        action: 'approve',
        reviewNote: '已确认档期'
      }
    });
    if (reviewRes.statusCode !== 200 || reviewRes.json?.item?.status !== 'approved') {
      throw new Error('Self test failed: appointment review did not approve record');
    }

    await new Promise((resolve, reject) => {
      testServerA.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    storageA.close();

    const storageB = createSqliteStorage({ dbPath });
    storageB.init();
    const appB = createApp({ storage: storageB, nowProvider: fixedNow });
    const testServerB = await startTestServer(appB);

    const persistedRulesRes = await requestJson(testServerB.baseUrl, '/api/v1/staff/booking-rules', {
      headers: staffHeaders
    });
    if (
      persistedRulesRes.statusCode !== 200 ||
      persistedRulesRes.json?.item?.advanceOpenDays !== 1 ||
      persistedRulesRes.json?.item?.dailySlots?.[0]?.start !== '09:30'
    ) {
      throw new Error('Self test failed: booking rules were not retained after restart');
    }

    const myAppointmentsRes = await requestJson(testServerB.baseUrl, '/api/v1/my/appointments?phone=13900000000');
    const persistedAppointment = myAppointmentsRes.json?.items?.find((item) => item.id === appointmentId);
    if (myAppointmentsRes.statusCode !== 200 || persistedAppointment?.status !== 'approved') {
      throw new Error('Self test failed: appointment state was not retained after restart');
    }

    const availabilityRes = await requestJson(testServerB.baseUrl, '/api/v1/availability?month=2026-03');
    const testDay = availabilityRes.json?.days?.find((item) => item.date === '2026-03-14');
    const occupiedSlot = testDay?.slots?.find((slot) => slot.value === '09:30-10:30');
    if (availabilityRes.statusCode !== 200 || occupiedSlot?.bookable !== false) {
      throw new Error('Self test failed: availability did not reflect persisted approved slot after restart');
    }

    await new Promise((resolve, reject) => {
      testServerB.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    storageB.close();
    console.log('self-test ok');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.argv.includes('--self-test')) {
  runSelfTest().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
} else {
  const dbPath = process.env.SQLITE_PATH || resolveDefaultDbPath();
  const storage = createSqliteStorage({ dbPath });
  storage.init();

  const app = createApp({ storage });
  const server = http.createServer((req, res) => {
    app.handleRequest(req, res).catch((error) => {
      sendError(res, 500, error.message || 'Internal server error');
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`miniapp-server listening on http://127.0.0.1:${port}`);
    console.log(`sqlite ready at ${dbPath}`);
  });

  const closeStorage = () => {
    try {
      storage.close();
    } catch {
      // ignore close race during shutdown
    }
  };

  server.on('close', closeStorage);
  process.on('SIGINT', () => {
    server.close(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    server.close(() => process.exit(0));
  });
}
