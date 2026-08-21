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
        dailySlotsJson: JSON.stringify([slotA, slotB]),
        weeklyOpenDaysJson: JSON.stringify([0, 1, 2, 3, 4, 5, 6]),
        sameDayCutoffTime: null,
        minAdvanceHours: 0,
        dateSlotOverridesJson: JSON.stringify({})
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

    await runCase('PATCH review same status -> updates latest review note', async () => {
      const result = await request(`/api/v1/staff/appointments/${ids.happy}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify({
          status: 'approved',
          reviewNote: 'latest approved note'
        })
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.item?.status === 'approved', 'expected approved after repeat patch');
      assert(result.json?.item?.reviewNote === 'latest approved note', 'expected latest review note');
      return result.json.item;
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

    await runCase('PATCH occupied approved -> rejected releases slot', async () => {
      const result = await request(`/api/v1/staff/appointments/${ids.occupiedApproved}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify({
          status: 'rejected',
          reviewNote: 'release slot'
        })
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.item?.status === 'rejected', 'expected rejected after release patch');

      const availabilityResult = await request(`/api/v1/availability?date=${occupiedDate}`);
      const slotAItem = findByTimeSlot(availabilityResult.json?.items || [], slotA);
      assert(slotAItem?.status === 'active', 'expected slotA active after releasing approved booking');
      return {
        review: result.json.item,
        availability: slotAItem
      };
    });

    await runCase('PATCH occupied rejected -> approved re-occupies slot', async () => {
      const result = await request(`/api/v1/staff/appointments/${ids.occupiedApproved}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify({
          status: 'approved',
          reviewNote: 're-approve slot'
        })
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.item?.status === 'approved', 'expected approved after re-approve patch');

      const availabilityResult = await request(`/api/v1/availability?date=${occupiedDate}`);
      const slotAItem = findByTimeSlot(availabilityResult.json?.items || [], slotA);
      assert(slotAItem?.status === 'disabled', 'expected slotA disabled again after re-approve');
      assert(slotAItem?.reasonCode === 'SLOT_OCCUPIED', 'expected slotA SLOT_OCCUPIED after re-approve');
      return {
        review: result.json.item,
        availability: slotAItem
      };
    });

    await runCase('PATCH approved -> cancelled -> approved clears cancellation metadata', async () => {
      const cancelResult = await request(`/api/v1/staff/appointments/${ids.occupiedApproved}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify({
          status: 'cancelled',
          reviewNote: 'temporary cancellation'
        })
      });

      assert(cancelResult.status === 200, `expected 200 cancelling, got ${cancelResult.status}`);
      assert(cancelResult.json?.item?.status === 'cancelled', 'expected cancelled status');

      const approveResult = await request(`/api/v1/staff/appointments/${ids.occupiedApproved}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify({
          status: 'approved',
          reviewNote: 'restored after cancellation'
        })
      });

      assert(approveResult.status === 200, `expected 200 approving, got ${approveResult.status}`);
      assert(approveResult.json?.item?.status === 'approved', 'expected approved status after restore');

      const detailResult = await request(`/api/v1/staff/appointments/${ids.occupiedApproved}`, {
        headers: {
          'X-Staff-OpenId': STAFF_OPEN_ID
        }
      });
      assert(detailResult.status === 200, `expected detail 200, got ${detailResult.status}`);
      assert(detailResult.json?.item?.cancelledAt === null, 'expected cancelledAt cleared');
      assert(detailResult.json?.item?.cancelledBy === null, 'expected cancelledBy cleared');
      assert(detailResult.json?.item?.cancelReason === '', 'expected cancelReason cleared');
      return detailResult.json.item;
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

    await runCase('GET staff appointments invalid date -> INVALID_DATE', async () => {
      const result = await request('/api/v1/staff/appointments?date=not-a-date', {
        headers: {
          'X-Staff-OpenId': STAFF_OPEN_ID
        }
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_DATE', `expected INVALID_DATE, got ${result.json?.code}`);
      return result.json;
    });

    await runCase('GET staff appointments invalid date range -> INVALID_DATE_RANGE', async () => {
      const result = await request('/api/v1/staff/appointments?dateFrom=2030-04-03&dateTo=2030-04-01', {
        headers: {
          'X-Staff-OpenId': STAFF_OPEN_ID
        }
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_DATE_RANGE', `expected INVALID_DATE_RANGE, got ${result.json?.code}`);
      return result.json;
    });

    await runCase('GET staff appointments exact date takes precedence over invalid range', async () => {
      const result = await request(`/api/v1/staff/appointments?date=${openDate}&dateFrom=not-a-date&dateTo=also-not-a-date`, {
        headers: {
          'X-Staff-OpenId': STAFF_OPEN_ID
        }
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(Array.isArray(result.json?.items), 'expected items array');
      assert(result.json.items.length > 0, 'expected exact-date appointments');
      assert(result.json.items.every((item) => item.date === openDate), 'expected only exact-date appointments');
      assert(result.json.items.some((item) => item.id === ids.happy), 'expected happy appointment in exact-date list');
      return { count: result.json.items.length, date: openDate };
    });

    await runCase('POST review malformed body -> INVALID_REVIEW_PAYLOAD', async () => {
      const result = await request(`/api/v1/staff/appointments/${ids.happy}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: '[]'
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_REVIEW_PAYLOAD', `expected INVALID_REVIEW_PAYLOAD, got ${result.json?.code}`);
      return result.json;
    });

    await runCase('PATCH reschedule malformed body -> INVALID_RESCHEDULE_PAYLOAD', async () => {
      const result = await request(`/api/v1/staff/appointments/${ids.happy}/reschedule`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: '[]'
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_RESCHEDULE_PAYLOAD', `expected INVALID_RESCHEDULE_PAYLOAD, got ${result.json?.code}`);
      return result.json;
    });

    await runCase('GET staff appointments keyword filter -> finds customer name', async () => {
      const result = await request('/api/v1/staff/appointments?keyword=Parallel%20Happy', {
        headers: {
          'X-Staff-OpenId': STAFF_OPEN_ID
        }
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json.items.some((item) => item.id === ids.happy), 'expected happy appointment in keyword filter');
      return { count: result.json.items.length };
    });

    await runCase('PATCH staff reschedule pending appointment -> updates date and slot', async () => {
      const result = await request(`/api/v1/staff/appointments/${ids.occupiedPending}/reschedule`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify({
          appointmentDate: openDate,
          timeSlot: slotB,
          reviewNote: 'reschedule pending in smoke'
        })
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.item?.date === openDate, 'expected rescheduled date');
      assert(result.json?.item?.timeSlot === slotB, 'expected rescheduled slot');
      return result.json.item;
    });

    await runCase('GET staff appointment audit logs -> includes status and reschedule logs', async () => {
      const happyLogs = await request(`/api/v1/staff/appointments/${ids.happy}/audit-logs`, {
        headers: {
          'X-Staff-OpenId': STAFF_OPEN_ID
        }
      });
      const pendingLogs = await request(`/api/v1/staff/appointments/${ids.occupiedPending}/audit-logs`, {
        headers: {
          'X-Staff-OpenId': STAFF_OPEN_ID
        }
      });

      assert(happyLogs.status === 200, `expected happy logs 200, got ${happyLogs.status}`);
      assert(pendingLogs.status === 200, `expected pending logs 200, got ${pendingLogs.status}`);
      assert(happyLogs.json.items.some((item) => item.action === 'STAFF_STATUS_UPDATE'), 'expected status log');
      assert(pendingLogs.json.items.some((item) => item.action === 'STAFF_RESCHEDULE'), 'expected reschedule log');
      return {
        happyLogCount: happyLogs.json.items.length,
        pendingLogCount: pendingLogs.json.items.length
      };
    });

    await runCase('PATCH approved appointment -> completed releases slot', async () => {
      const result = await request(`/api/v1/staff/appointments/${ids.happy}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify({
          status: 'completed',
          reviewNote: 'completed in smoke'
        })
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.item?.status === 'completed', 'expected completed status');
      const availabilityResult = await request(`/api/v1/availability?date=${openDate}`);
      const slotAItem = findByTimeSlot(availabilityResult.json?.items || [], slotA);
      assert(slotAItem?.status === 'active', 'expected slotA active after completed');
      return {
        review: result.json.item,
        availability: slotAItem
      };
    });

    console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, cases }, null, 2));
  } finally {
    const cleanupAppointments = await prisma.appointment.findMany({
      where: {
        OR: [
          { id: { in: [ids.happy, ids.occupiedApproved, ids.occupiedPending].filter(Boolean) } },
          { customerOpenId: { startsWith: cleanupCustomerPrefix } }
        ]
      },
      select: {
        id: true
      }
    });
    await prisma.appointmentAuditLog.deleteMany({
      where: {
        appointmentId: {
          in: cleanupAppointments.map((item) => item.id)
        }
      }
    });
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
