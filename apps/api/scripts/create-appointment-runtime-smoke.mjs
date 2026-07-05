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

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
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

async function main() {
  const openDate = '2030-03-22';
  const openDatePlusOne = '2030-03-23';
  const openDatePlusTwo = '2030-03-24';
  const openDatePlusThree = '2030-03-25';
  const outOfRangeDate = '2050-03-22';
  const sharedTimeSlot = '10:00-11:00';
  const secondTimeSlot = '14:00-15:00';
  const bookingRuleId = `rule-${runId}`;
  const approvedConflictId = `approved-${runId}`;
  const cleanupCustomerPrefix = `cust-${runId}`;
  const cases = [];

  async function runCase(name, fn) {
    const detail = await fn();
    cases.push({ name, ok: true, detail });
  }

  try {
    await prisma.bookingRule.create({
      data: {
        id: bookingRuleId,
        advanceOpenDays: 5000,
        closedDatesJson: JSON.stringify([]),
        dailySlotsJson: JSON.stringify([sharedTimeSlot, secondTimeSlot])
      }
    });

    await runCase('create unauthorized -> CUSTOMER_UNAUTHORIZED', async () => {
      const result = await request('/api/v1/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentDate: openDate, timeSlot: sharedTimeSlot })
      });

      assert(result.status === 401, `expected 401, got ${result.status}`);
      assert(result.json?.code === 'CUSTOMER_UNAUTHORIZED', 'expected CUSTOMER_UNAUTHORIZED');
      return result.json;
    });

    await runCase('create invalid slot -> INVALID_SLOT', async () => {
      const result = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': `${cleanupCustomerPrefix}-invalid-slot`
        },
        body: JSON.stringify({ appointmentDate: openDate, timeSlot: '99:00-99:30' })
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_SLOT', 'expected INVALID_SLOT');
      return result.json;
    });

    await runCase('create date out of range -> DATE_OUT_OF_RANGE', async () => {
      const result = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': `${cleanupCustomerPrefix}-out-of-range`
        },
        body: JSON.stringify({ appointmentDate: outOfRangeDate, timeSlot: sharedTimeSlot })
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'DATE_OUT_OF_RANGE', 'expected DATE_OUT_OF_RANGE');
      return result.json;
    });

    await runCase('create happy path -> pending', async () => {
      const result = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': `${cleanupCustomerPrefix}-happy`
        },
        body: JSON.stringify({
          appointmentDate: openDate,
          timeSlot: sharedTimeSlot,
          customerName: 'Smoke Happy',
          phone: '13800000000',
          note: 'happy path'
        })
      });

      assert(result.status === 201, `expected 201, got ${result.status}`);
      assert(result.json?.item?.status === 'pending', 'expected pending status');
      assert(result.json?.item?.date === openDate, 'expected normalized date');
      return result.json.item;
    });

    await runCase('create legacy date field -> pending', async () => {
      const result = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': `${cleanupCustomerPrefix}-legacy-date`
        },
        body: JSON.stringify({
          date: openDate,
          timeSlot: secondTimeSlot,
          customerName: 'Legacy Date'
        })
      });

      assert(result.status === 201, `expected 201, got ${result.status}`);
      assert(result.json?.item?.status === 'pending', 'expected pending status');
      assert(result.json?.item?.date === openDate, 'expected normalized date');
      return result.json.item;
    });

    await runCase('create ignores body customerOpenId', async () => {
      const headerCustomerOpenId = `${cleanupCustomerPrefix}-header-owner`;
      const result = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': headerCustomerOpenId
        },
        body: JSON.stringify({
          appointmentDate: openDatePlusOne,
          timeSlot: sharedTimeSlot,
          customerOpenId: 'forged-openid'
        })
      });

      assert(result.status === 201, `expected 201, got ${result.status}`);
      assert(result.json?.item?.customerOpenId === headerCustomerOpenId, 'expected header customerOpenId');
      return result.json.item;
    });

    await runCase('create same-slot pending does not occupy', async () => {
      const slotDate = openDatePlusTwo;
      const firstCustomer = `${cleanupCustomerPrefix}-pending-a`;
      const secondCustomer = `${cleanupCustomerPrefix}-pending-b`;

      const first = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': firstCustomer
        },
        body: JSON.stringify({ appointmentDate: slotDate, timeSlot: sharedTimeSlot })
      });
      const second = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': secondCustomer
        },
        body: JSON.stringify({ appointmentDate: slotDate, timeSlot: sharedTimeSlot })
      });

      assert(first.status === 201, `expected first 201, got ${first.status}`);
      assert(second.status === 201, `expected second 201, got ${second.status}`);
      assert(first.json?.item?.status === 'pending', 'expected first pending');
      assert(second.json?.item?.status === 'pending', 'expected second pending');

      return {
        firstId: first.json?.item?.id,
        secondId: second.json?.item?.id
      };
    });

    await prisma.appointment.create({
      data: {
        id: approvedConflictId,
        customerOpenId: `${cleanupCustomerPrefix}-approved-conflict`,
        customerName: 'Approved Conflict',
        date: openDatePlusThree,
        timeSlot: sharedTimeSlot,
        approvedSlotKey: `${openDatePlusThree}#${sharedTimeSlot}`,
        status: AppointmentStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedByOpenId: 'staff-openid-demo',
        reviewNote: 'seed approved conflict'
      }
    });

    await runCase('create approved slot conflict -> SLOT_OCCUPIED', async () => {
      const result = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': `${cleanupCustomerPrefix}-slot-conflict`
        },
        body: JSON.stringify({
          appointmentDate: openDatePlusThree,
          timeSlot: sharedTimeSlot
        })
      });

      assert(result.status === 409, `expected 409, got ${result.status}`);
      assert(result.json?.code === 'SLOT_OCCUPIED', 'expected SLOT_OCCUPIED');
      return result.json;
    });

    console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, cases }, null, 2));
  } finally {
    await prisma.appointment.deleteMany({
      where: {
        OR: [
          { id: approvedConflictId },
          { customerOpenId: { startsWith: cleanupCustomerPrefix } }
        ]
      }
    });
    await prisma.bookingRule.deleteMany({ where: { id: bookingRuleId } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, baseUrl: BASE_URL, error: `${error?.message || error}` }, null, 2));
  process.exit(1);
});
