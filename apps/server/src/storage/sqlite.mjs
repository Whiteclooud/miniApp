import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const defaultGallerySeed = [
  {
    id: 'gallery-001',
    imageUrl: 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?auto=format&fit=crop&w=800&q=80',
    title: '玫瑰猫眼',
    tags: ['猫眼', '温柔', '春日'],
    description: '适合日常和约会场景的温柔风格',
    sortOrder: 1,
    status: 'active',
    createdAt: new Date('2026-03-12T00:00:00.000Z').toISOString()
  },
  {
    id: 'gallery-002',
    imageUrl: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=800&q=80',
    title: '奶杏法式',
    tags: ['法式', '通勤', '耐看'],
    description: '低饱和奶杏色，适合上班和日常出行',
    sortOrder: 2,
    status: 'active',
    createdAt: new Date('2026-03-12T00:00:00.000Z').toISOString()
  },
  {
    id: 'gallery-003',
    imageUrl: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80',
    title: '轻奢闪片',
    tags: ['闪片', '节日', '上镜'],
    description: '适合聚会和拍照的轻奢感款式',
    sortOrder: 3,
    status: 'active',
    createdAt: new Date('2026-03-12T00:00:00.000Z').toISOString()
  }
];

const defaultBookingRuleSeed = {
  id: 'rule-default',
  advanceOpenDays: 2,
  closedDates: ['2026-03-18', '2026-03-25'],
  dailySlots: [
    { start: '10:00', end: '11:30' },
    { start: '14:00', end: '15:30' },
    { start: '16:00', end: '17:30' }
  ],
  updatedAt: new Date('2026-03-12T00:00:00.000Z').toISOString()
};

const defaultAppointmentSeed = {
  id: 'apt-001',
  customerName: 'Lan',
  phone: '13800000000',
  appointmentDate: '2026-03-16',
  timeSlot: '14:00-15:30',
  note: '想做温柔通勤款',
  status: 'pending',
  reviewNote: '',
  createdAt: new Date('2026-03-12T02:00:00.000Z').toISOString(),
  reviewedAt: null
};

function parseJsonArray(value, fallback = []) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function mapGalleryRow(row) {
  return {
    id: row.id,
    imageUrl: row.image_url,
    title: row.title,
    tags: parseJsonArray(row.tags_json),
    description: row.description || '',
    sortOrder: row.sort_order,
    status: row.status,
    createdAt: row.created_at
  };
}

function mapRuleRow(row) {
  return {
    id: row.id,
    advanceOpenDays: row.advance_open_days,
    closedDates: parseJsonArray(row.closed_dates_json),
    dailySlots: parseJsonArray(row.daily_slots_json),
    updatedAt: row.updated_at
  };
}

function mapAppointmentRow(row) {
  return {
    id: row.id,
    customerName: row.customer_name,
    phone: row.phone,
    appointmentDate: row.appointment_date,
    timeSlot: row.time_slot,
    note: row.note || '',
    status: row.status,
    reviewNote: row.review_note || '',
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at || null
  };
}

export function resolveDefaultDbPath() {
  const currentFile = fileURLToPath(import.meta.url);
  return resolve(dirname(currentFile), '../../data/miniapp.sqlite');
}

export function createSqliteStorage({ dbPath = resolveDefaultDbPath() } = {}) {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  let statements = null;

  function ensureStatements() {
    if (statements) {
      return statements;
    }

    statements = {
      galleryCount: db.prepare('SELECT COUNT(*) AS count FROM gallery_items'),
      ruleCount: db.prepare('SELECT COUNT(*) AS count FROM booking_rules'),
      appointmentCount: db.prepare('SELECT COUNT(*) AS count FROM appointments'),
      insertGallery: db.prepare(`
        INSERT INTO gallery_items (id, image_url, title, tags_json, description, sort_order, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `),
      insertRule: db.prepare(`
        INSERT INTO booking_rules (id, advance_open_days, closed_dates_json, daily_slots_json, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `),
      insertAppointment: db.prepare(`
        INSERT INTO appointments (
          id, customer_name, phone, appointment_date, time_slot, note, status, review_note, created_at, reviewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      listActiveGallery: db.prepare(`
        SELECT * FROM gallery_items
        WHERE status = 'active'
        ORDER BY sort_order ASC, created_at DESC
      `),
      getRule: db.prepare(`
        SELECT * FROM booking_rules
        ORDER BY updated_at DESC, id ASC
        LIMIT 1
      `),
      updateRule: db.prepare(`
        UPDATE booking_rules
        SET advance_open_days = ?, closed_dates_json = ?, daily_slots_json = ?, updated_at = ?
        WHERE id = ?
      `),
      listApprovedAppointments: db.prepare(`
        SELECT * FROM appointments
        WHERE status = 'approved'
        ORDER BY created_at DESC
      `),
      listAppointmentsByPhone: db.prepare(`
        SELECT * FROM appointments
        WHERE phone = ?
        ORDER BY created_at DESC
      `),
      listAppointmentsByStatus: db.prepare(`
        SELECT * FROM appointments
        WHERE status = ?
        ORDER BY created_at DESC
      `),
      listAllAppointments: db.prepare(`
        SELECT * FROM appointments
        ORDER BY created_at DESC
      `),
      getAppointmentById: db.prepare(`
        SELECT * FROM appointments
        WHERE id = ?
        LIMIT 1
      `),
      updateAppointmentReview: db.prepare(`
        UPDATE appointments
        SET status = ?, review_note = ?, reviewed_at = ?
        WHERE id = ?
      `),
      latestAppointmentId: db.prepare(`
        SELECT id FROM appointments
        WHERE id LIKE 'apt-%'
        ORDER BY CAST(SUBSTR(id, 5) AS INTEGER) DESC
        LIMIT 1
      `)
    };

    return statements;
  }

  function init() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS gallery_items (
        id TEXT PRIMARY KEY,
        image_url TEXT NOT NULL,
        title TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        description TEXT DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS booking_rules (
        id TEXT PRIMARY KEY,
        advance_open_days INTEGER NOT NULL DEFAULT 0,
        closed_dates_json TEXT NOT NULL,
        daily_slots_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        appointment_date TEXT NOT NULL,
        time_slot TEXT NOT NULL,
        note TEXT DEFAULT '',
        status TEXT NOT NULL,
        review_note TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        reviewed_at TEXT DEFAULT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_appointments_phone
      ON appointments (phone);

      CREATE INDEX IF NOT EXISTS idx_appointments_date_status
      ON appointments (appointment_date, status);

      CREATE INDEX IF NOT EXISTS idx_appointments_pending
      ON appointments (status, created_at);
    `);

    ensureStatements();
    seedIfEmpty();
  }

  function seedIfEmpty() {
    const prepared = ensureStatements();
    const galleryCount = Number(prepared.galleryCount.get().count || 0);
    if (galleryCount === 0) {
      for (const item of defaultGallerySeed) {
        prepared.insertGallery.run(
          item.id,
          item.imageUrl,
          item.title,
          JSON.stringify(item.tags),
          item.description,
          item.sortOrder,
          item.status,
          item.createdAt
        );
      }
    }

    const ruleCount = Number(prepared.ruleCount.get().count || 0);
    if (ruleCount === 0) {
      prepared.insertRule.run(
        defaultBookingRuleSeed.id,
        defaultBookingRuleSeed.advanceOpenDays,
        JSON.stringify(defaultBookingRuleSeed.closedDates),
        JSON.stringify(defaultBookingRuleSeed.dailySlots),
        defaultBookingRuleSeed.updatedAt
      );
    }

    const appointmentCount = Number(prepared.appointmentCount.get().count || 0);
    if (appointmentCount === 0) {
      prepared.insertAppointment.run(
        defaultAppointmentSeed.id,
        defaultAppointmentSeed.customerName,
        defaultAppointmentSeed.phone,
        defaultAppointmentSeed.appointmentDate,
        defaultAppointmentSeed.timeSlot,
        defaultAppointmentSeed.note,
        defaultAppointmentSeed.status,
        defaultAppointmentSeed.reviewNote,
        defaultAppointmentSeed.createdAt,
        defaultAppointmentSeed.reviewedAt
      );
    }
  }

  function listGalleryItems() {
    return ensureStatements().listActiveGallery.all().map(mapGalleryRow);
  }

  function getBookingRule() {
    const row = ensureStatements().getRule.get();
    return row ? mapRuleRow(row) : null;
  }

  function saveBookingRule(rule) {
    ensureStatements().updateRule.run(
      rule.advanceOpenDays,
      JSON.stringify(rule.closedDates),
      JSON.stringify(rule.dailySlots),
      rule.updatedAt,
      rule.id
    );
    return getBookingRule();
  }

  function listApprovedAppointments() {
    return ensureStatements().listApprovedAppointments.all().map(mapAppointmentRow);
  }

  function listAppointments({ phone, status } = {}) {
    const prepared = ensureStatements();
    if (phone) {
      return prepared.listAppointmentsByPhone.all(phone).map(mapAppointmentRow);
    }
    if (status) {
      return prepared.listAppointmentsByStatus.all(status).map(mapAppointmentRow);
    }
    return prepared.listAllAppointments.all().map(mapAppointmentRow);
  }

  function getAppointmentById(id) {
    const row = ensureStatements().getAppointmentById.get(id);
    return row ? mapAppointmentRow(row) : null;
  }

  function createAppointment(input) {
    const prepared = ensureStatements();
    const latest = prepared.latestAppointmentId.get();
    const currentNumber = latest?.id ? Number.parseInt(String(latest.id).slice(4), 10) : 0;
    const nextNumber = Number.isFinite(currentNumber) ? currentNumber + 1 : 1;
    const item = {
      id: `apt-${String(nextNumber).padStart(3, '0')}`,
      customerName: input.customerName,
      phone: input.phone,
      appointmentDate: input.appointmentDate,
      timeSlot: input.timeSlot,
      note: input.note || '',
      status: 'pending',
      reviewNote: '',
      createdAt: input.createdAt,
      reviewedAt: null
    };

    prepared.insertAppointment.run(
      item.id,
      item.customerName,
      item.phone,
      item.appointmentDate,
      item.timeSlot,
      item.note,
      item.status,
      item.reviewNote,
      item.createdAt,
      item.reviewedAt
    );

    return item;
  }

  function updateAppointmentReview({ id, status, reviewNote, reviewedAt }) {
    ensureStatements().updateAppointmentReview.run(status, reviewNote || '', reviewedAt, id);
    return getAppointmentById(id);
  }

  function close() {
    db.close();
  }

  return {
    dbPath,
    init,
    close,
    listGalleryItems,
    getBookingRule,
    saveBookingRule,
    listApprovedAppointments,
    listAppointments,
    getAppointmentById,
    createAppointment,
    updateAppointmentReview
  };
}
