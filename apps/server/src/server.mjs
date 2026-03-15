import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 3000);
const defaultDbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'miniapp.sqlite');
const defaultStaffOpenId = 'staff-openid-v1';
const allowedStaffOpenIds = new Set(
  String(process.env.STAFF_OPEN_IDS || process.env.STAFF_OPEN_ID || defaultStaffOpenId)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);

const seedServices = [
  {
    id: 'svc-classic',
    name: '经典纯色美甲',
    durationMinutes: 60,
    price: 168,
    description: '适合日常通勤的基础款'
  },
  {
    id: 'svc-design',
    name: '轻奢款式设计',
    durationMinutes: 90,
    price: 268,
    description: '适合拍照和节日场景'
  },
  {
    id: 'svc-french',
    name: '法式清透款',
    durationMinutes: 75,
    price: 228,
    description: '适合约会和精致通勤场景'
  }
];

const seedGalleryItems = [
  {
    id: 'gallery-aurora',
    title: '极光猫眼',
    imageUrl: 'https://example.com/images/aurora-cat-eye.jpg',
    tags: ['猫眼', '通勤', '热门'],
    priceFrom: 198,
    serviceId: 'svc-design',
    serviceName: '轻奢款式设计',
    ctaText: '预约同款',
    sortOrder: 1,
    status: 'active'
  },
  {
    id: 'gallery-french',
    title: '奶油法式',
    imageUrl: 'https://example.com/images/cream-french.jpg',
    tags: ['法式', '温柔', '约会'],
    priceFrom: 228,
    serviceId: 'svc-french',
    serviceName: '法式清透款',
    ctaText: '立即预约',
    sortOrder: 2,
    status: 'active'
  },
  {
    id: 'gallery-glossy',
    title: '琥珀镜面',
    imageUrl: 'https://example.com/images/amber-glossy.jpg',
    tags: ['镜面', '轻奢', '人气'],
    priceFrom: 268,
    serviceId: 'svc-design',
    serviceName: '轻奢款式设计',
    ctaText: '预约同款',
    sortOrder: 3,
    status: 'active'
  }
];

const seedAvailabilitySlots = [
  { date: '2026-03-16', timeSlot: '10:00-11:00' },
  { date: '2026-03-16', timeSlot: '11:30-12:30' },
  { date: '2026-03-16', timeSlot: '14:00-15:00' },
  { date: '2026-03-17', timeSlot: '10:00-11:00' },
  { date: '2026-03-17', timeSlot: '11:30-12:30' },
  { date: '2026-03-17', timeSlot: '14:00-15:00' },
  { date: '2026-03-18', timeSlot: '10:00-11:00' },
  { date: '2026-03-18', timeSlot: '11:30-12:30' },
  { date: '2026-03-18', timeSlot: '14:00-15:00' }
];

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Customer-OpenId, X-Staff-OpenId',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS'
  });

  if (statusCode === 204) {
    res.end();
    return;
  }

  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
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

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) {
    return String(value[0] || '').trim();
  }
  return String(value || '').trim();
}

function getCustomerOpenId(req) {
  return normalizeHeaderValue(req.headers['x-customer-openid']);
}

function getStaffOpenId(req) {
  return normalizeHeaderValue(req.headers['x-staff-openid']);
}

function sendCustomerUnauthorized(res) {
  sendJson(res, 401, {
    error: 'Customer unauthorized',
    code: 'CUSTOMER_UNAUTHORIZED'
  });
}

function requireCustomer(req, res) {
  const customerOpenId = getCustomerOpenId(req);
  if (!customerOpenId) {
    sendCustomerUnauthorized(res);
    return null;
  }
  return customerOpenId;
}

function requireStaff(req, res) {
  const staffOpenId = getStaffOpenId(req);
  if (!staffOpenId || !allowedStaffOpenIds.has(staffOpenId)) {
    sendJson(res, 401, {
      error: 'Staff unauthorized',
      code: 'STAFF_UNAUTHORIZED'
    });
    return null;
  }
  return staffOpenId;
}

function ensureDirForFile(filePath) {
  if (filePath === ':memory:') {
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function tableExists(db, tableName) {
  return Boolean(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = :tableName")
      .get({ tableName })
  );
}

function tableColumns(db, tableName) {
  if (!tableExists(db, tableName)) {
    return [];
  }
  return db.prepare(`PRAGMA table_info(${tableName})`).all();
}

function columnExists(db, tableName, columnName) {
  return tableColumns(db, tableName).some((column) => column.name === columnName);
}

function ensureColumn(db, tableName, columnName, definition) {
  if (!columnExists(db, tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function createAppointmentsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      artist_id TEXT DEFAULT '',
      artist_name TEXT DEFAULT '',
      date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      note TEXT DEFAULT '',
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      customer_open_id TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT,
      reviewed_by TEXT,
      review_note TEXT DEFAULT ''
    )
  `);
}

function buildLegacyAppointmentId(row, index) {
  const id = String(row.id || '').trim();
  if (id) {
    return id;
  }

  const customerOpenId = String(row.customer_open_id || row.customerOpenId || '').trim();
  if (customerOpenId) {
    return `legacy-${customerOpenId}`;
  }

  return `legacy-appointment-${index + 1}`;
}

function migrateAppointmentsTable(db) {
  if (!tableExists(db, 'appointments')) {
    createAppointmentsTable(db);
    return;
  }

  const columns = tableColumns(db, 'appointments');
  const hasIdColumn = columns.some((column) => column.name === 'id');

  if (!hasIdColumn) {
    const backupTableName = `appointments_legacy_${Date.now()}`;
    db.exec(`ALTER TABLE appointments RENAME TO ${backupTableName}`);
    createAppointmentsTable(db);

    const rows = db.prepare(`SELECT * FROM ${backupTableName}`).all();
    const insertStatement = db.prepare(`
      INSERT INTO appointments (
        id,
        customer_name,
        phone,
        service_id,
        service_name,
        artist_id,
        artist_name,
        date,
        time_slot,
        note,
        status,
        created_at,
        customer_open_id,
        reviewed_at,
        reviewed_by,
        review_note
      ) VALUES (
        :id,
        :customerName,
        :phone,
        :serviceId,
        :serviceName,
        :artistId,
        :artistName,
        :date,
        :timeSlot,
        :note,
        :status,
        :createdAt,
        :customerOpenId,
        :reviewedAt,
        :reviewedBy,
        :reviewNote
      )
    `);

    for (const [index, row] of rows.entries()) {
      insertStatement.run({
        id: buildLegacyAppointmentId(row, index),
        customerName: String(row.customer_name || row.customerName || ''),
        phone: String(row.phone || ''),
        serviceId: String(row.service_id || row.serviceId || ''),
        serviceName: String(row.service_name || row.serviceName || ''),
        artistId: String(row.artist_id || row.artistId || ''),
        artistName: String(row.artist_name || row.artistName || ''),
        date: String(row.date || ''),
        timeSlot: String(row.time_slot || row.timeSlot || ''),
        note: String(row.note || ''),
        status: String(row.status || 'pending'),
        createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
        customerOpenId: String(row.customer_open_id || row.customerOpenId || ''),
        reviewedAt: row.reviewed_at || row.reviewedAt || null,
        reviewedBy: String(row.reviewed_by || row.reviewedBy || ''),
        reviewNote: String(row.review_note || row.reviewNote || '')
      });
    }

    db.exec(`DROP TABLE ${backupTableName}`);
  }

  ensureColumn(db, 'appointments', 'customer_open_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'appointments', 'artist_id', "TEXT DEFAULT ''");
  ensureColumn(db, 'appointments', 'artist_name', "TEXT DEFAULT ''");
  ensureColumn(db, 'appointments', 'reviewed_at', 'TEXT');
  ensureColumn(db, 'appointments', 'reviewed_by', 'TEXT');
  ensureColumn(db, 'appointments', 'review_note', "TEXT DEFAULT ''");
}

function resolveActiveSlotConflicts(db) {
  const rows = db.prepare(`
    SELECT id, date, time_slot, status, created_at
    FROM appointments
    WHERE status IN ('pending', 'approved')
    ORDER BY date ASC,
             time_slot ASC,
             CASE status WHEN 'approved' THEN 0 ELSE 1 END ASC,
             datetime(created_at) ASC,
             id ASC
  `).all();

  const seen = new Set();
  const rejectStatement = db.prepare(`
    UPDATE appointments
    SET status = 'rejected',
        reviewed_at = COALESCE(reviewed_at, :reviewedAt),
        reviewed_by = COALESCE(NULLIF(reviewed_by, ''), 'migration'),
        review_note = CASE
          WHEN COALESCE(review_note, '') = '' THEN :reviewNote
          ELSE review_note || ' | ' || :reviewNote
        END
    WHERE id = :id
  `);
  const reviewedAt = new Date().toISOString();
  const reviewNote = 'Migrated duplicate active slot';

  for (const row of rows) {
    const key = `${row.date}__${row.time_slot}`;
    if (!seen.has(key)) {
      seen.add(key);
      continue;
    }

    rejectStatement.run({
      id: row.id,
      reviewedAt,
      reviewNote
    });
  }
}

function createIndexes(db) {
  resolveActiveSlotConflicts(db);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_appointments_customer_open_id
      ON appointments(customer_open_id, created_at DESC)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_appointments_status_created_at
      ON appointments(status, created_at DESC)
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_slot_active
      ON appointments(date, time_slot)
      WHERE status IN ('pending', 'approved')
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_availability_slots_date
      ON availability_slots(date, time_slot)
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_availability_slot_unique
      ON availability_slots(date, time_slot)
  `);
}

function setupDatabase(dbPath = defaultDbPath) {
  ensureDirForFile(dbPath);
  const db = new DatabaseSync(dbPath);

  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      price INTEGER NOT NULL,
      description TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS gallery_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      image_url TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      price_from INTEGER NOT NULL,
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      cta_text TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      status TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS availability_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    )
  `);

  migrateAppointmentsTable(db);
  createIndexes(db);
  seedIfEmpty(db);

  return db;
}

function seedIfEmpty(db) {
  const serviceCount = db.prepare('SELECT COUNT(*) AS count FROM services').get().count;
  if (serviceCount === 0) {
    const insertService = db.prepare(`
      INSERT INTO services (id, name, duration_minutes, price, description)
      VALUES (:id, :name, :durationMinutes, :price, :description)
    `);

    for (const service of seedServices) {
      insertService.run(service);
    }
  }

  const galleryCount = db.prepare('SELECT COUNT(*) AS count FROM gallery_items').get().count;
  if (galleryCount === 0) {
    const insertGalleryItem = db.prepare(`
      INSERT INTO gallery_items (
        id,
        title,
        image_url,
        tags_json,
        price_from,
        service_id,
        service_name,
        cta_text,
        sort_order,
        status
      ) VALUES (
        :id,
        :title,
        :imageUrl,
        :tagsJson,
        :priceFrom,
        :serviceId,
        :serviceName,
        :ctaText,
        :sortOrder,
        :status
      )
    `);

    for (const item of seedGalleryItems) {
      insertGalleryItem.run({
        id: item.id,
        title: item.title,
        imageUrl: item.imageUrl,
        tagsJson: JSON.stringify(item.tags),
        priceFrom: item.priceFrom,
        serviceId: item.serviceId,
        serviceName: item.serviceName,
        ctaText: item.ctaText,
        sortOrder: item.sortOrder,
        status: item.status
      });
    }
  }

  const availabilityCount = db.prepare('SELECT COUNT(*) AS count FROM availability_slots').get().count;
  if (availabilityCount === 0) {
    const insertAvailability = db.prepare(`
      INSERT INTO availability_slots (date, time_slot, status)
      VALUES (:date, :timeSlot, 'active')
    `);

    for (const slot of seedAvailabilitySlots) {
      insertAvailability.run(slot);
    }
  }
}

function isSqliteConstraintError(error) {
  const message = String(error?.message || '');
  return message.includes('constraint') || message.includes('UNIQUE');
}

function normalizeAppointment(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    customerOpenId: row.customer_open_id,
    customerName: row.customer_name,
    phone: row.phone,
    serviceId: row.service_id,
    serviceName: row.service_name,
    artistId: row.artist_id || '',
    artistName: row.artist_name || '',
    date: row.date,
    timeSlot: row.time_slot,
    note: row.note || '',
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at || null,
    reviewedBy: row.reviewed_by || null,
    reviewNote: row.review_note || ''
  };
}

function normalizeGalleryItem(row) {
  return {
    id: row.id,
    title: row.title,
    imageUrl: row.image_url,
    tags: JSON.parse(row.tags_json),
    priceFrom: row.price_from,
    serviceId: row.service_id,
    serviceName: row.service_name,
    ctaText: row.cta_text,
    sortOrder: row.sort_order,
    status: row.status
  };
}

function normalizeAvailability(row) {
  return {
    date: row.date,
    timeSlot: row.time_slot,
    status: row.status
  };
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function isValidTimeSlot(value) {
  return /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(String(value || ''));
}

function createAppContext({ dbPath = defaultDbPath } = {}) {
  const db = setupDatabase(dbPath);

  const queries = {
    getServiceById: db.prepare('SELECT * FROM services WHERE id = :id'),
    listGallery: db.prepare(`
      SELECT *
      FROM gallery_items
      WHERE status = 'active'
      ORDER BY sort_order ASC, id ASC
    `),
    listAvailability: db.prepare(`
      SELECT slot.date, slot.time_slot, slot.status
      FROM availability_slots AS slot
      WHERE slot.status = 'active'
        AND (:date = '' OR slot.date = :date)
        AND NOT EXISTS (
          SELECT 1
          FROM appointments AS apt
          WHERE apt.date = slot.date
            AND apt.time_slot = slot.time_slot
            AND apt.status IN ('pending', 'approved')
        )
      ORDER BY slot.date ASC, slot.time_slot ASC
    `),
    getAvailabilitySlot: db.prepare(`
      SELECT *
      FROM availability_slots
      WHERE date = :date
        AND time_slot = :timeSlot
        AND status = 'active'
    `),
    createAppointment: db.prepare(`
      INSERT INTO appointments (
        id,
        customer_name,
        phone,
        service_id,
        service_name,
        artist_id,
        artist_name,
        date,
        time_slot,
        note,
        status,
        created_at,
        customer_open_id,
        review_note
      ) VALUES (
        :id,
        :customerName,
        :phone,
        :serviceId,
        :serviceName,
        :artistId,
        :artistName,
        :date,
        :timeSlot,
        :note,
        :status,
        :createdAt,
        :customerOpenId,
        ''
      )
    `),
    getAppointmentById: db.prepare('SELECT * FROM appointments WHERE id = :id'),
    listCustomerAppointments: db.prepare(`
      SELECT *
      FROM appointments
      WHERE customer_open_id = :customerOpenId
      ORDER BY datetime(created_at) DESC, id DESC
    `),
    listStaffAppointments: db.prepare(`
      SELECT *
      FROM appointments
      ORDER BY datetime(created_at) DESC, id DESC
    `),
    updateReviewedAppointment: db.prepare(`
      UPDATE appointments
      SET status = :status,
          reviewed_at = :reviewedAt,
          reviewed_by = :reviewedBy,
          review_note = :reviewNote
      WHERE id = :id
    `)
  };

  return { db, queries };
}

function getAppointmentDate(body) {
  const appointmentDate = String(body.appointmentDate || '').trim();
  if (appointmentDate) {
    return appointmentDate;
  }
  return String(body.date || '').trim();
}

function buildAppointmentPayload(body, customerOpenId) {
  return {
    id: `apt-${randomUUID()}`,
    customerOpenId,
    customerName: String(body.customerName || '').trim(),
    phone: String(body.phone || '').trim(),
    serviceId: String(body.serviceId || '').trim(),
    serviceName: String(body.serviceName || '').trim(),
    artistId: String(body.artistId || '').trim(),
    artistName: String(body.artistName || '').trim(),
    date: getAppointmentDate(body),
    timeSlot: String(body.timeSlot || '').trim(),
    note: String(body.note || '').trim(),
    status: 'pending',
    createdAt: new Date().toISOString()
  };
}

function normalizeReviewStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'approve') {
    return 'approved';
  }
  if (normalized === 'reject') {
    return 'rejected';
  }
  if (normalized === 'approved' || normalized === 'rejected') {
    return normalized;
  }
  return '';
}

async function handleRequest(req, res, context) {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const { queries } = context;

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'miniapp-server',
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/v1/gallery') {
    const items = queries.listGallery.all().map(normalizeGalleryItem);
    sendJson(res, 200, { items });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/v1/availability') {
    const date = String(url.searchParams.get('date') || '').trim();
    if (date && !isValidDate(date)) {
      sendJson(res, 400, { error: 'Invalid date' });
      return;
    }

    const items = queries.listAvailability.all({ date }).map(normalizeAvailability);
    sendJson(res, 200, { items });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/v1/my/appointments') {
    const customerOpenId = requireCustomer(req, res);
    if (!customerOpenId) {
      return;
    }

    const items = queries.listCustomerAppointments.all({ customerOpenId }).map(normalizeAppointment);
    sendJson(res, 200, { items });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/v1/staff/appointments') {
    if (!requireStaff(req, res)) {
      return;
    }

    const items = queries.listStaffAppointments.all().map(normalizeAppointment);
    sendJson(res, 200, { items });
    return;
  }

  const staffAppointmentMatch = req.method === 'GET'
    ? url.pathname.match(/^\/api\/v1\/staff\/appointments\/([^/]+)$/)
    : null;
  if (staffAppointmentMatch) {
    if (!requireStaff(req, res)) {
      return;
    }

    const item = queries.getAppointmentById.get({ id: decodeURIComponent(staffAppointmentMatch[1]) });
    if (!item) {
      sendJson(res, 404, {
        error: 'Appointment not found',
        code: 'APPOINTMENT_NOT_FOUND'
      });
      return;
    }

    sendJson(res, 200, { item: normalizeAppointment(item) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/v1/appointments') {
    const customerOpenId = requireCustomer(req, res);
    if (!customerOpenId) {
      return;
    }

    try {
      const body = await readJson(req);
      const item = buildAppointmentPayload(body, customerOpenId);
      const required = [
        ['serviceId', item.serviceId],
        ['serviceName', item.serviceName],
        ['appointmentDate', item.date],
        ['timeSlot', item.timeSlot]
      ];
      const missing = required.filter(([, value]) => !value).map(([field]) => field);

      if (missing.length > 0) {
        sendJson(res, 400, { error: 'Missing required fields', missing });
        return;
      }

      if (!isValidDate(item.date) || !isValidTimeSlot(item.timeSlot)) {
        sendJson(res, 400, { error: 'Invalid slot' });
        return;
      }

      const service = queries.getServiceById.get({ id: item.serviceId });
      if (!service || service.name !== item.serviceName) {
        sendJson(res, 400, { error: 'Invalid service' });
        return;
      }

      const validSlot = queries.getAvailabilitySlot.get({
        date: item.date,
        timeSlot: item.timeSlot
      });
      if (!validSlot) {
        sendJson(res, 400, { error: 'Invalid slot' });
        return;
      }

      try {
        queries.createAppointment.run(item);
      } catch (error) {
        if (isSqliteConstraintError(error)) {
          sendJson(res, 409, { error: 'Slot occupied' });
          return;
        }
        throw error;
      }

      const created = queries.getAppointmentById.get({ id: item.id });
      sendJson(res, 201, { item: normalizeAppointment(created) });
      return;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Bad request' });
      return;
    }
  }

  const reviewMatch = req.method === 'POST' || req.method === 'PATCH'
    ? url.pathname.match(/^\/api\/v1\/staff\/appointments\/([^/]+)\/review$/)
    : null;
  if (reviewMatch) {
    const staffOpenId = requireStaff(req, res);
    if (!staffOpenId) {
      return;
    }

    try {
      const id = decodeURIComponent(reviewMatch[1]);
      const body = await readJson(req);
      const nextStatus = normalizeReviewStatus(body.status || body.action);
      const reviewNote = String(body.reviewNote || '').trim();

      if (!nextStatus) {
        sendJson(res, 400, {
          error: 'Invalid review status',
          code: 'INVALID_REVIEW_STATUS'
        });
        return;
      }

      const appointment = queries.getAppointmentById.get({ id });
      if (!appointment) {
        sendJson(res, 404, {
          error: 'Appointment not found',
          code: 'APPOINTMENT_NOT_FOUND'
        });
        return;
      }

      if (appointment.status !== 'pending') {
        sendJson(res, 409, { error: 'Already reviewed' });
        return;
      }

      queries.updateReviewedAppointment.run({
        id,
        status: nextStatus,
        reviewedAt: new Date().toISOString(),
        reviewedBy: staffOpenId,
        reviewNote
      });

      const updated = queries.getAppointmentById.get({ id });
      sendJson(res, 200, { item: normalizeAppointment(updated) });
      return;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Bad request' });
      return;
    }
  }

  sendJson(res, 404, {
    error: 'Not found',
    path: url.pathname
  });
}

function createServer({ dbPath = defaultDbPath } = {}) {
  const context = createAppContext({ dbPath });
  const server = http.createServer((req, res) => {
    handleRequest(req, res, context).catch((error) => {
      sendJson(res, 500, { error: error.message || 'Internal server error' });
    });
  });

  const close = server.close.bind(server);
  server.close = (callback) =>
    close((error) => {
      try {
        context.db.close();
      } catch {
        // ignore close errors during shutdown
      }
      if (callback) {
        callback(error);
      }
    });

  return server;
}

async function withStartedServer(dbPath, callback) {
  const server = createServer({ dbPath });
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await callback(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function requestJson(baseUrl, pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  let body = options.body;

  if (body !== undefined && typeof body !== 'string') {
    body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(new URL(pathname, baseUrl), {
    method: options.method || 'GET',
    headers,
    body
  });

  const text = await response.text();
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: text ? JSON.parse(text) : null
  };
}

function createLegacyDatabase(dbPath) {
  ensureDirForFile(dbPath);
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE appointments (
      customer_open_id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      artist_id TEXT NOT NULL DEFAULT '',
      artist_name TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      reviewed_at TEXT
    )
  `);

  db.prepare(`
    INSERT INTO appointments (
      customer_open_id,
      customer_name,
      phone,
      service_id,
      service_name,
      artist_id,
      artist_name,
      date,
      time_slot,
      note,
      status,
      created_at,
      updated_at,
      reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'legacy-openid-001',
    'Legacy User',
    '13700000000',
    'svc-classic',
    '经典纯色美甲',
    '',
    '',
    '2026-03-17',
    '10:00-11:00',
    'legacy row',
    'approved',
    '2026-03-10T10:00:00.000Z',
    '2026-03-10T10:00:00.000Z',
    '2026-03-10T11:00:00.000Z'
  );

  db.close();
}

function createLegacyDatabaseMissingCustomerOpenId(dbPath) {
  ensureDirForFile(dbPath);
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE appointments (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    )
  `);

  db.prepare(`
    INSERT INTO appointments (
      id,
      customer_name,
      phone,
      service_id,
      service_name,
      date,
      time_slot,
      note,
      status,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'apt-legacy-phone-001',
    'Phone Legacy User',
    '13600000000',
    'svc-french',
    '法式清透款',
    '2026-03-18',
    '10:00-11:00',
    'legacy row without customer_open_id',
    'pending',
    '2026-03-11T09:00:00.000Z'
  );

  db.close();
}

async function runSelfTest() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miniapp-server-'));
  const dbPath = path.join(tempDir, 'test.sqlite');
  const legacyDbPath = path.join(tempDir, 'legacy.sqlite');
  const legacyMissingCustomerOpenIdDbPath = path.join(tempDir, 'legacy-missing-customer-openid.sqlite');

  try {
    await withStartedServer(dbPath, async (baseUrl) => {
      const galleryRes = await requestJson(baseUrl, '/api/v1/gallery');
      assert.equal(galleryRes.status, 200);
      assert.ok(Array.isArray(galleryRes.body.items));
      assert.ok(galleryRes.body.items.length >= 3);

      const corsPreflightRes = await requestJson(baseUrl, '/api/v1/appointments', {
        method: 'OPTIONS'
      });
      assert.equal(corsPreflightRes.status, 204);
      assert.match(
        String(corsPreflightRes.headers['access-control-allow-headers'] || '').toLowerCase(),
        /x-customer-openid/
      );

      const availabilityRes = await requestJson(baseUrl, '/api/v1/availability?date=2026-03-16');
      assert.equal(availabilityRes.status, 200);
      assert.ok(Array.isArray(availabilityRes.body.items));
      assert.ok(availabilityRes.body.items.some((item) => item.timeSlot === '10:00-11:00'));

      const unauthorizedCreateRes = await requestJson(baseUrl, '/api/v1/appointments', {
        method: 'POST',
        body: {}
      });
      assert.equal(unauthorizedCreateRes.status, 401);
      assert.deepEqual(unauthorizedCreateRes.body, {
        error: 'Customer unauthorized',
        code: 'CUSTOMER_UNAUTHORIZED'
      });

      const unauthorizedMyRes = await requestJson(baseUrl, '/api/v1/my/appointments');
      assert.equal(unauthorizedMyRes.status, 401);
      assert.deepEqual(unauthorizedMyRes.body, {
        error: 'Customer unauthorized',
        code: 'CUSTOMER_UNAUTHORIZED'
      });

      const createRes = await requestJson(baseUrl, '/api/v1/appointments', {
        method: 'POST',
        headers: {
          'X-Customer-OpenId': 'openid-customer-001'
        },
        body: {
          customerOpenId: 'body-should-be-ignored',
          serviceId: 'svc-classic',
          serviceName: '经典纯色美甲',
          artistId: 'artist-luna',
          artistName: 'Luna',
          appointmentDate: '2026-03-16',
          timeSlot: '10:00-11:00'
        }
      });
      assert.equal(createRes.status, 201);
      assert.equal(createRes.body.item.customerOpenId, 'openid-customer-001');
      assert.notEqual(createRes.body.item.customerOpenId, 'body-should-be-ignored');
      assert.equal(createRes.body.item.customerName, '');
      assert.equal(createRes.body.item.phone, '');
      assert.equal(createRes.body.item.status, 'pending');

      const createWithContactRes = await requestJson(baseUrl, '/api/v1/appointments', {
        method: 'POST',
        headers: {
          'X-Customer-OpenId': 'openid-customer-002'
        },
        body: {
          customerName: 'Lan',
          phone: '13800000000',
          serviceId: 'svc-design',
          serviceName: '轻奢款式设计',
          appointmentDate: '2026-03-16',
          timeSlot: '11:30-12:30',
          note: '请尽量自然风'
        }
      });
      assert.equal(createWithContactRes.status, 201);
      assert.equal(createWithContactRes.body.item.customerOpenId, 'openid-customer-002');
      assert.equal(createWithContactRes.body.item.customerName, 'Lan');
      assert.equal(createWithContactRes.body.item.phone, '13800000000');

      const myPendingRes = await requestJson(baseUrl, '/api/v1/my/appointments', {
        headers: {
          'X-Customer-OpenId': 'openid-customer-001'
        }
      });
      assert.equal(myPendingRes.status, 200);
      assert.equal(myPendingRes.body.items.length, 1);
      assert.equal(myPendingRes.body.items[0].customerOpenId, 'openid-customer-001');
      assert.equal(myPendingRes.body.items[0].status, 'pending');

      const otherCustomerRes = await requestJson(baseUrl, '/api/v1/my/appointments', {
        headers: {
          'X-Customer-OpenId': 'openid-customer-003'
        }
      });
      assert.equal(otherCustomerRes.status, 200);
      assert.equal(otherCustomerRes.body.items.length, 0);

      const phoneIgnoredRes = await requestJson(baseUrl, '/api/v1/my/appointments?phone=13800000000', {
        headers: {
          'X-Customer-OpenId': 'openid-customer-003'
        }
      });
      assert.equal(phoneIgnoredRes.status, 200);
      assert.equal(phoneIgnoredRes.body.items.length, 0);

      const legacyServicesRes = await requestJson(baseUrl, '/api/v1/services');
      assert.equal(legacyServicesRes.status, 404);

      const legacyQueryRes = await requestJson(baseUrl, '/api/v1/appointments?phone=13800000000');
      assert.equal(legacyQueryRes.status, 404);

      const unauthorizedStaffRes = await requestJson(baseUrl, '/api/v1/staff/appointments');
      assert.equal(unauthorizedStaffRes.status, 401);
      assert.equal(unauthorizedStaffRes.body.code, 'STAFF_UNAUTHORIZED');

      const staffListRes = await requestJson(baseUrl, '/api/v1/staff/appointments', {
        headers: {
          'X-Staff-OpenId': defaultStaffOpenId
        }
      });
      assert.equal(staffListRes.status, 200);
      assert.equal(staffListRes.body.items.length, 2);
      assert.ok(staffListRes.body.items.every((item) => item.customerOpenId));
      assert.ok(staffListRes.body.items.some((item) => item.customerName === 'Lan' && item.phone === '13800000000'));

      const appointmentId = createRes.body.item.id;
      const reviewRes = await requestJson(baseUrl, `/api/v1/staff/appointments/${appointmentId}/review`, {
        method: 'POST',
        headers: {
          'X-Staff-OpenId': defaultStaffOpenId
        },
        body: {
          status: 'approved',
          reviewNote: '已确认档期'
        }
      });
      assert.equal(reviewRes.status, 200);
      assert.equal(reviewRes.body.item.status, 'approved');
      assert.equal(reviewRes.body.item.reviewedBy, defaultStaffOpenId);
      assert.equal(reviewRes.body.item.customerOpenId, 'openid-customer-001');

      const reviewedAgainRes = await requestJson(baseUrl, `/api/v1/staff/appointments/${appointmentId}/review`, {
        method: 'POST',
        headers: {
          'X-Staff-OpenId': defaultStaffOpenId
        },
        body: {
          status: 'rejected'
        }
      });
      assert.equal(reviewedAgainRes.status, 409);
      assert.equal(reviewedAgainRes.body.error, 'Already reviewed');

      const myApprovedRes = await requestJson(baseUrl, '/api/v1/my/appointments', {
        headers: {
          'X-Customer-OpenId': 'openid-customer-001'
        }
      });
      assert.equal(myApprovedRes.status, 200);
      assert.equal(myApprovedRes.body.items.length, 1);
      assert.equal(myApprovedRes.body.items[0].customerOpenId, 'openid-customer-001');
      assert.equal(myApprovedRes.body.items[0].status, 'approved');
    });

    await withStartedServer(dbPath, async (baseUrl) => {
      const persistedMyRes = await requestJson(baseUrl, '/api/v1/my/appointments', {
        headers: {
          'X-Customer-OpenId': 'openid-customer-001'
        }
      });
      assert.equal(persistedMyRes.status, 200);
      assert.equal(persistedMyRes.body.items.length, 1);
      assert.equal(persistedMyRes.body.items[0].customerOpenId, 'openid-customer-001');
      assert.equal(persistedMyRes.body.items[0].status, 'approved');
      assert.equal(persistedMyRes.body.items[0].reviewedBy, defaultStaffOpenId);

      const persistedStaffRes = await requestJson(baseUrl, '/api/v1/staff/appointments', {
        headers: {
          'X-Staff-OpenId': defaultStaffOpenId
        }
      });
      assert.equal(persistedStaffRes.status, 200);
      assert.equal(persistedStaffRes.body.items.length, 2);
      assert.ok(persistedStaffRes.body.items.every((item) => item.customerOpenId));
    });

    createLegacyDatabase(legacyDbPath);
    await withStartedServer(legacyDbPath, async (baseUrl) => {
      const staffListRes = await requestJson(baseUrl, '/api/v1/staff/appointments', {
        headers: {
          'X-Staff-OpenId': defaultStaffOpenId
        }
      });
      assert.equal(staffListRes.status, 200);
      assert.equal(staffListRes.body.items.length, 1);
      assert.equal(staffListRes.body.items[0].customerOpenId, 'legacy-openid-001');
      assert.ok(staffListRes.body.items[0].id);

      const myLegacyRes = await requestJson(baseUrl, '/api/v1/my/appointments', {
        headers: {
          'X-Customer-OpenId': 'legacy-openid-001'
        }
      });
      assert.equal(myLegacyRes.status, 200);
      assert.equal(myLegacyRes.body.items.length, 1);
      assert.equal(myLegacyRes.body.items[0].status, 'approved');
    });

    createLegacyDatabaseMissingCustomerOpenId(legacyMissingCustomerOpenIdDbPath);
    await withStartedServer(legacyMissingCustomerOpenIdDbPath, async (baseUrl) => {
      const migratedStaffListRes = await requestJson(baseUrl, '/api/v1/staff/appointments', {
        headers: {
          'X-Staff-OpenId': defaultStaffOpenId
        }
      });
      assert.equal(migratedStaffListRes.status, 200);
      assert.equal(migratedStaffListRes.body.items.length, 1);
      assert.equal(migratedStaffListRes.body.items[0].id, 'apt-legacy-phone-001');
      assert.equal(migratedStaffListRes.body.items[0].customerOpenId, '');
      assert.equal(migratedStaffListRes.body.items[0].phone, '13600000000');

      const migratedCreateRes = await requestJson(baseUrl, '/api/v1/appointments', {
        method: 'POST',
        headers: {
          'X-Customer-OpenId': 'openid-migrated-customer-001'
        },
        body: {
          customerName: 'Migrated New User',
          phone: '13500000000',
          serviceId: 'svc-classic',
          serviceName: '经典纯色美甲',
          appointmentDate: '2026-03-16',
          timeSlot: '14:00-15:00'
        }
      });
      assert.equal(migratedCreateRes.status, 201);
      assert.equal(migratedCreateRes.body.item.customerOpenId, 'openid-migrated-customer-001');

      const migratedMyRes = await requestJson(baseUrl, '/api/v1/my/appointments?phone=13600000000', {
        headers: {
          'X-Customer-OpenId': 'openid-migrated-customer-001'
        }
      });
      assert.equal(migratedMyRes.status, 200);
      assert.equal(migratedMyRes.body.items.length, 1);
      assert.equal(migratedMyRes.body.items[0].customerOpenId, 'openid-migrated-customer-001');
      assert.equal(migratedMyRes.body.items[0].phone, '13500000000');
    });

    console.log('self-test ok');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

const isMainModule = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

export { createServer, runSelfTest };

if (isMainModule) {
  if (process.argv.includes('--self-test')) {
    runSelfTest().catch((error) => {
      console.error(error.stack || error.message);
      process.exit(1);
    });
  } else {
    const server = createServer({ dbPath: defaultDbPath });

    const shutdown = () => {
      server.close(() => {
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    server.listen(port, '0.0.0.0', () => {
      console.log(`miniapp-server listening on http://127.0.0.1:${port}`);
    });
  }
}
