const { PrismaClient } = require('@prisma/client');

const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3100';
const STAFF_OPEN_ID = process.env.STAFF_OPEN_ID || 'staff-openid-demo';
const prisma = new PrismaClient();

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const text = await response.text();

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_error) {
    json = null;
  }

  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    text,
    json
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findByTimeSlot(items, timeSlot) {
  return items.find((item) => item.timeSlot === timeSlot);
}

async function main() {
  const cases = [];
  const smokeRunId = `${Date.now()}`;
  const bookingRuleId = `parallel-rule-${smokeRunId}`;
  const cleanupCustomerPrefix = `parallel-customer-${smokeRunId}`;
  const openDate = '2030-04-01';
  const occupiedDate = '2030-04-02';
  const slotA = '10:00-11:00';
  const slotB = '14:00-15:00';
  const ids = {
    happy: null,
    occupiedApproved: null,
    occupiedPending: null
  };

  async function runCase(name, fn) {
    const startedAt = Date.now();
    const detail = await fn();
    cases.push({
      name,
      ok: true,
      durationMs: Date.now() - startedAt,
      detail
    });
  }

  try {
    await prisma.bookingRule.create({
      data: {
        id: bookingRuleId,
        advanceOpenDays: 5000,
        closedDatesJson: JSON.stringify([]),
        dailySlotsJson: JSON.stringify([slotA, slotB])
      }
    });

    await runCase('GET /health', async () => {
      const result = await request('/health');
      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.ok === true, 'expected ok=true');
      assert(result.json?.service === 'miniapp-api', 'expected service=miniapp-api');
      return result.json;
    });

    await runCase('GET /api/v1/gallery', async () => {
      const result = await request('/api/v1/gallery');
      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(Array.isArray(result.json?.items), 'expected items array');
      return { count: result.json.items.length };
    });

    await runCase('GET /api/v1/staff/booking-rules', async () => {
      const result = await request('/api/v1/staff/booking-rules', {
        headers: {
          'X-Staff-OpenId': STAFF_OPEN_ID
        }
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.item?.advanceOpenDays === 5000, 'expected seeded booking rule');
      assert(Array.isArray(result.json?.item?.dailySlots), 'expected dailySlots array');
      return result.json.item;
    });

    await runCase('GET /api/v1/availability?date=openDate -> dateOptions + selectedDate + AVAILABLE', async () => {
      const result = await request(`/api/v1/availability?date=${openDate}`);
      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(Array.isArray(result.json?.dateOptions), 'expected dateOptions array');
      assert(result.json?.selectedDate === openDate, 'expected selectedDate=openDate');
      assert(result.json.dateOptions.includes(openDate), 'expected openDate in dateOptions');
      const items = result.json?.items || [];
      assert(items.length === 2, `expected 2 slots, got ${items.length}`);
      assert(items.every((item) => item.status === 'active'), 'expected all active');
      assert(items.every((item) => item.reasonCode === 'AVAILABLE'), 'expected AVAILABLE');
      return {
        selectedDate: result.json.selectedDate,
        dateOptionsCount: result.json.dateOptions.length,
        items
      };
    });

    await runCase('POST /api/v1/appointments -> CUSTOMER_UNAUTHORIZED', async () => {
      const result = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          appointmentDate: openDate,
          timeSlot: slotA
        })
      });

      assert(result.status === 401, `expected 401, got ${result.status}`);
      assert(result.json?.code === 'CUSTOMER_UNAUTHORIZED', 'expected CUSTOMER_UNAUTHORIZED');
      return result.json;
    });

    await runCase('POST /api/v1/appointments happy-path -> pending', async () => {
      const customerOpenId = `${cleanupCustomerPrefix}-happy`;
      const result = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': customerOpenId
        },
        body: JSON.stringify({
          appointmentDate: openDate,
          timeSlot: slotA,
          customerName: 'Parallel Happy',
          note: 'parallel smoke'
        })
      });

      assert(result.status === 201, `expected 201, got ${result.status}`);
      assert(result.json?.item?.status === 'pending', 'expected pending status');
      ids.happy = result.json.item.id;
      return result.json.item;
    });

    await runCase('GET /api/v1/my/appointments -> includes pending item', async () => {
      const customerOpenId = `${cleanupCustomerPrefix}-happy`;
      const result = await request('/api/v1/my/appointments', {
        headers: {
          'X-Customer-OpenId': customerOpenId
        }
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(Array.isArray(result.json?.items), 'expected items array');
      assert(result.json.items.some((item) => item.id === ids.happy && item.status === 'pending'), 'expected pending item in my appointments');
      return { count: result.json.items.length, appointmentId: ids.happy };
    });

    await runCase('POST review happy-path -> approved', async () => {
      const result = await request(`/api/v1/staff/appointments/${ids.happy}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify({
          status: 'approved',
          reviewNote: 'approved in parallel smoke'
        })
      });

      assert(result.status === 201, `expected 201, got ${result.status}`);
      assert(result.json?.item?.status === 'approved', 'expected approved status');
      return result.json.item;
    });

    await runCase('PATCH review repeated -> APPOINTMENT_ALREADY_REVIEWED', async () => {
      const result = await request(`/api/v1/staff/appointments/${ids.happy}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify({
          status: 'rejected',
          reviewNote: 'should fail as repeated review'
        })
      });

      assert(result.status === 409, `expected 409, got ${result.status}`);
      assert(result.json?.code === 'APPOINTMENT_ALREADY_REVIEWED', 'expected APPOINTMENT_ALREADY_REVIEWED');
      return result.json;
    });

    await runCase('POST same approved slot create -> SLOT_OCCUPIED', async () => {
      const result = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': `${cleanupCustomerPrefix}-approved-conflict-create`
        },
        body: JSON.stringify({
          appointmentDate: openDate,
          timeSlot: slotA
        })
      });

      assert(result.status === 409, `expected 409, got ${result.status}`);
      assert(result.json?.code === 'SLOT_OCCUPIED', 'expected SLOT_OCCUPIED');
      return result.json;
    });

    await runCase('create occupiedDate slotA pending then approve', async () => {
      const createResult = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': `${cleanupCustomerPrefix}-occupied-approved`
        },
        body: JSON.stringify({
          appointmentDate: occupiedDate,
          timeSlot: slotA
        })
      });

      assert(createResult.status === 201, `expected 201, got ${createResult.status}`);
      ids.occupiedApproved = createResult.json?.item?.id;

      const reviewResult = await request(`/api/v1/staff/appointments/${ids.occupiedApproved}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify({
          status: 'approved',
          reviewNote: 'occupy slot for availability'
        })
      });

      assert(reviewResult.status === 201, `expected 201, got ${reviewResult.status}`);
      assert(reviewResult.json?.item?.status === 'approved', 'expected approved status');
      return {
        appointmentId: ids.occupiedApproved,
        review: reviewResult.json.item
      };
    });

    await runCase('create occupiedDate slotB pending remains pending', async () => {
      const createResult = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': `${cleanupCustomerPrefix}-occupied-pending`
        },
        body: JSON.stringify({
          appointmentDate: occupiedDate,
          timeSlot: slotB
        })
      });

      assert(createResult.status === 201, `expected 201, got ${createResult.status}`);
      assert(createResult.json?.item?.status === 'pending', 'expected pending status');
      ids.occupiedPending = createResult.json.item.id;
      return createResult.json.item;
    });

    await runCase('GET /api/v1/availability?date=occupiedDate -> approved disabled, pending active', async () => {
      const result = await request(`/api/v1/availability?date=${occupiedDate}`);
      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.selectedDate === occupiedDate, 'expected occupiedDate selected');
      const items = result.json?.items || [];
      const slotAItem = findByTimeSlot(items, slotA);
      const slotBItem = findByTimeSlot(items, slotB);
      assert(slotAItem?.status === 'disabled', 'expected slotA disabled');
      assert(slotAItem?.reasonCode === 'SLOT_OCCUPIED', 'expected slotA SLOT_OCCUPIED');
      assert(slotBItem?.status === 'active', 'expected slotB active');
      assert(slotBItem?.reasonCode === 'AVAILABLE', 'expected slotB AVAILABLE');
      return { slotA: slotAItem, slotB: slotBItem };
    });

    await runCase('GET /api/v1/staff/appointments default -> full list', async () => {
      const result = await request('/api/v1/staff/appointments', {
        headers: {
          'X-Staff-OpenId': STAFF_OPEN_ID
        }
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(Array.isArray(result.json?.items), 'expected items array');
      assert(result.json.items.some((item) => item.id === ids.happy && item.status === 'approved'), 'expected approved item in default full list');
      assert(result.json.items.some((item) => item.id === ids.occupiedPending && item.status === 'pending'), 'expected pending item in default full list');
      return { count: result.json.items.length };
    });

    await runCase('GET /api/v1/staff/appointments?status=pending -> filtered list', async () => {
      const result = await request('/api/v1/staff/appointments?status=pending', {
        headers: {
          'X-Staff-OpenId': STAFF_OPEN_ID
        }
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(Array.isArray(result.json?.items), 'expected items array');
      assert(result.json.items.every((item) => item.status === 'pending'), 'expected only pending items');
      assert(result.json.items.some((item) => item.id === ids.occupiedPending), 'expected pending item in filtered list');
      return { count: result.json.items.length };
    });

    console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, cases }, null, 2));
  } finally {
    await prisma.appointment.deleteMany({
      where: {
        OR: [
          { id: { in: [ids.happy, ids.occupiedApproved, ids.occupiedPending].filter(Boolean) } },
          { customerOpenId: { startsWith: cleanupCustomerPrefix } }
        ]
      }
    });
    await prisma.bookingRule.deleteMany({ where: { id: bookingRuleId } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        baseUrl: BASE_URL,
        error: error instanceof Error ? error.message : `${error}`
      },
      null,
      2
    )
  );
  process.exit(1);
});
