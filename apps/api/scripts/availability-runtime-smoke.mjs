import { PrismaClient, AppointmentStatus } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3100';
const runId = `${Date.now()}`;

function shanghaiDateText(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai'
  }).format(date);
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function request(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch (_error) {
    json = null;
  }

  return { status: response.status, json, text };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findItem(items, timeSlot) {
  return items.find((item) => item.timeSlot === timeSlot);
}

async function main() {
  const today = shanghaiDateText();
  const openDate = addDays(today, 1);
  const closedDate = addDays(today, 2);
  const occupiedDate = addDays(today, 3);
  const outOfRangeDate = addDays(today, 8);
  const bookingRuleId = `availability-rule-${runId}`;
  const approvedId = `availability-approved-${runId}`;
  const pendingId = `availability-pending-${runId}`;
  const cases = [];

  async function runCase(name, fn) {
    const detail = await fn();
    cases.push({ name, ok: true, detail });
  }

  try {
    await prisma.bookingRule.create({
      data: {
        id: bookingRuleId,
        advanceOpenDays: 7,
        closedDatesJson: JSON.stringify([closedDate]),
        dailySlotsJson: JSON.stringify(['10:00-11:00', '14:00-15:00']),
        weeklyOpenDaysJson: JSON.stringify([0, 1, 2, 3, 4, 5, 6]),
        sameDayCutoffTime: null,
        minAdvanceHours: 0,
        dateSlotOverridesJson: JSON.stringify({})
      }
    });

    await prisma.appointment.create({
      data: {
        id: approvedId,
        customerOpenId: `availability-customer-approved-${runId}`,
        date: occupiedDate,
        timeSlot: '10:00-11:00',
        approvedSlotKey: `${occupiedDate}#10:00-11:00`,
        status: AppointmentStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedByOpenId: 'staff-openid-demo',
        reviewNote: 'seed approved slot'
      }
    });

    await prisma.appointment.create({
      data: {
        id: pendingId,
        customerOpenId: `availability-customer-pending-${runId}`,
        date: occupiedDate,
        timeSlot: '14:00-15:00',
        status: AppointmentStatus.PENDING
      }
    });

    await runCase('default date falls back to today and returns window options', async () => {
      const result = await request('/api/v1/availability');
      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(Array.isArray(result.json?.dateOptions), 'expected dateOptions array');
      assert(result.json?.selectedDate === today, 'expected selectedDate=today');
      assert(result.json.dateOptions[0] === today, 'expected first date option to be today');
      assert(Array.isArray(result.json?.items), 'expected items array');
      assert(result.json.items.every((item) => item.date === today), 'expected today fallback');
      return {
        selectedDate: result.json.selectedDate,
        dateOptionsCount: result.json.dateOptions.length,
        count: result.json.items.length
      };
    });

    await runCase('invalid date -> INVALID_DATE', async () => {
      const result = await request('/api/v1/availability?date=2026-13-40');
      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_DATE', 'expected INVALID_DATE');
      return result.json;
    });

    await runCase('available date -> AVAILABLE with selectedDate and dateOptions', async () => {
      const result = await request(`/api/v1/availability?date=${openDate}`);
      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(Array.isArray(result.json?.dateOptions), 'expected dateOptions array');
      assert(result.json?.selectedDate === openDate, 'expected selectedDate=openDate');
      assert(result.json.dateOptions.includes(openDate), 'expected openDate in dateOptions');
      const items = result.json?.items || [];
      assert(items.length === 2, `expected 2 slots, got ${items.length}`);
      assert(items.every((item) => item.status === 'active'), 'expected all active');
      assert(items.every((item) => item.reasonCode === 'AVAILABLE'), 'expected AVAILABLE');
      return items;
    });

    await runCase('closed date -> DATE_CLOSED', async () => {
      const result = await request(`/api/v1/availability?date=${closedDate}`);
      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.selectedDate === closedDate, 'expected selectedDate=closedDate');
      const items = result.json?.items || [];
      assert(items.every((item) => item.status === 'disabled'), 'expected all disabled');
      assert(items.every((item) => item.reasonCode === 'DATE_CLOSED'), 'expected DATE_CLOSED');
      return items;
    });

    await runCase('out of range date -> DATE_OUT_OF_RANGE', async () => {
      const result = await request(`/api/v1/availability?date=${outOfRangeDate}`);
      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.selectedDate === outOfRangeDate, 'expected selectedDate=outOfRangeDate');
      const items = result.json?.items || [];
      assert(items.every((item) => item.status === 'disabled'), 'expected all disabled');
      assert(items.every((item) => item.reasonCode === 'DATE_OUT_OF_RANGE'), 'expected DATE_OUT_OF_RANGE');
      return items;
    });

    await runCase('approved occupies but pending does not', async () => {
      const result = await request(`/api/v1/availability?date=${occupiedDate}`);
      assert(result.status === 200, `expected 200, got ${result.status}`);
      const items = result.json?.items || [];
      const approvedSlot = findItem(items, '10:00-11:00');
      const pendingSlot = findItem(items, '14:00-15:00');
      assert(approvedSlot?.status === 'disabled', 'expected approved slot disabled');
      assert(approvedSlot?.reasonCode === 'SLOT_OCCUPIED', 'expected SLOT_OCCUPIED');
      assert(pendingSlot?.status === 'active', 'expected pending slot still active');
      assert(pendingSlot?.reasonCode === 'AVAILABLE', 'expected pending slot AVAILABLE');
      return { approvedSlot, pendingSlot };
    });

    console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, cases }, null, 2));
  } finally {
    await prisma.appointment.deleteMany({ where: { id: { in: [approvedId, pendingId] } } });
    await prisma.bookingRule.deleteMany({ where: { id: bookingRuleId } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, baseUrl: BASE_URL, error: `${error?.message || error}` }, null, 2));
  process.exit(1);
});
