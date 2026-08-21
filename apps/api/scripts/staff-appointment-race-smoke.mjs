import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3100';
const STAFF_OPEN_ID = process.env.STAFF_OPEN_ID || 'staff-openid-demo';
const prisma = new PrismaClient();
const SLOT_A = '10:00-11:00';
const SLOT_B = '14:00-15:00';
const TEST_DATE = '2031-05-01';
const ITERATIONS = 12;

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_error) {
    json = null;
  }
  return { status: response.status, json };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function staffHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Staff-OpenId': STAFF_OPEN_ID
  };
}

async function createPending(customerOpenId) {
  const result = await request('/api/v1/appointments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Customer-OpenId': customerOpenId
    },
    body: JSON.stringify({
      appointmentDate: TEST_DATE,
      timeSlot: SLOT_A
    })
  });
  assert(result.status === 201, `create expected 201, got ${result.status}`);
  return result.json.item.id;
}

async function approve(appointmentId) {
  const result = await request(`/api/v1/staff/appointments/${appointmentId}/review`, {
    method: 'POST',
    headers: staffHeaders(),
    body: JSON.stringify({ status: 'approved', reviewNote: 'race setup' })
  });
  assert(result.status === 201, `approve expected 201, got ${result.status}`);
}

async function runIteration(index, customerPrefix) {
  const appointmentId = await createPending(`${customerPrefix}-${index}`);
  await approve(appointmentId);

  const [reviewResult, rescheduleResult] = await Promise.all([
    request(`/api/v1/staff/appointments/${appointmentId}/review`, {
      method: 'PATCH',
      headers: staffHeaders(),
      body: JSON.stringify({ status: 'rejected', reviewNote: `race reject ${index}` })
    }),
    request(`/api/v1/staff/appointments/${appointmentId}/reschedule`, {
      method: 'PATCH',
      headers: staffHeaders(),
      body: JSON.stringify({
        appointmentDate: TEST_DATE,
        timeSlot: SLOT_B,
        reviewNote: `race reschedule ${index}`
      })
    })
  ]);

  const acceptedReviewStatuses = [200];
  const acceptedRescheduleStatuses = [200, 400];
  assert(
    acceptedReviewStatuses.includes(reviewResult.status),
    `iteration ${index}: review expected 200, got ${reviewResult.status}`
  );
  assert(
    acceptedRescheduleStatuses.includes(rescheduleResult.status),
    `iteration ${index}: reschedule expected 200/400, got ${rescheduleResult.status}`
  );
  if (rescheduleResult.status === 400) {
    assert(
      rescheduleResult.json?.code === 'APPOINTMENT_NOT_RESCHEDULABLE',
      `iteration ${index}: unexpected reschedule error ${rescheduleResult.json?.code}`
    );
  }

  const row = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, status: true, date: true, timeSlot: true, approvedSlotKey: true }
  });
  assert(row, `iteration ${index}: appointment disappeared before cleanup`);

  const expectedKey = row.status === 'APPROVED' ? `${row.date}#${row.timeSlot}` : null;
  assert(
    row.approvedSlotKey === expectedKey,
    `iteration ${index}: status=${row.status} date=${row.date} slot=${row.timeSlot} ` +
      `approvedSlotKey=${row.approvedSlotKey}, expected=${expectedKey}`
  );

  return {
    reviewStatus: reviewResult.status,
    rescheduleStatus: rescheduleResult.status,
    finalStatus: row.status,
    finalDate: row.date,
    finalTimeSlot: row.timeSlot,
    approvedSlotKey: row.approvedSlotKey
  };
}

async function main() {
  const runId = `${Date.now()}`;
  const customerPrefix = `staff-race-${runId}`;
  const ruleId = `staff-race-rule-${runId}`;
  const appointmentIds = [];
  const cases = [];

  try {
    await prisma.bookingRule.create({
      data: {
        id: ruleId,
        advanceOpenDays: 5000,
        closedDatesJson: JSON.stringify([]),
        dailySlotsJson: JSON.stringify([SLOT_A, SLOT_B]),
        weeklyOpenDaysJson: JSON.stringify([0, 1, 2, 3, 4, 5, 6]),
        sameDayCutoffTime: null,
        minAdvanceHours: 0,
        dateSlotOverridesJson: JSON.stringify({})
      }
    });

    for (let index = 0; index < ITERATIONS; index += 1) {
      const detail = await runIteration(index + 1, customerPrefix);
      cases.push(detail);
    }

    console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, iterations: ITERATIONS, cases }, null, 2));
  } finally {
    const appointments = await prisma.appointment.findMany({
      where: { customerOpenId: { startsWith: customerPrefix } },
      select: { id: true }
    });
    appointmentIds.push(...appointments.map((item) => item.id));
    if (appointmentIds.length) {
      await prisma.appointmentAuditLog.deleteMany({
        where: { appointmentId: { in: appointmentIds } }
      });
      await prisma.appointment.deleteMany({
        where: { id: { in: appointmentIds } }
      });
    }
    await prisma.bookingRule.deleteMany({ where: { id: ruleId } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    baseUrl: BASE_URL,
    error: error instanceof Error ? error.message : `${error}`
  }, null, 2));
  process.exitCode = 1;
});
