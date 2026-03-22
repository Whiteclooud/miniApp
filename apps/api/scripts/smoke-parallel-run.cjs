const { PrismaClient, AppointmentStatus } = require('@prisma/client');

const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3100';
const STAFF_OPEN_ID = process.env.STAFF_OPEN_ID || 'staff-openid-demo';
const CUSTOMER_OPEN_ID = process.env.CUSTOMER_OPEN_ID || 'openid-smoke-customer';
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

async function main() {
  const cases = [];
  const smokeRunId = `${Date.now()}`;
  const seededAppointmentIds = {
    happy: `apt-happy-${smokeRunId}`,
    conflictApproved: `apt-conflict-approved-${smokeRunId}`,
    conflictPending: `apt-conflict-pending-${smokeRunId}`
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

      return {
        count: result.json.items.length
      };
    });

    await runCase('GET /api/v1/staff/booking-rules', async () => {
      const result = await request('/api/v1/staff/booking-rules', {
        headers: {
          'X-Staff-OpenId': STAFF_OPEN_ID
        }
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.item, 'expected item object');
      assert(typeof result.json.item.advanceOpenDays === 'number', 'expected advanceOpenDays number');
      assert(Array.isArray(result.json.item.closedDates), 'expected closedDates array');
      assert(Array.isArray(result.json.item.dailySlots), 'expected dailySlots array');
      assert(typeof result.json.item.updatedAt === 'string', 'expected updatedAt string');

      return result.json.item;
    });

    await runCase('GET /api/v1/my/appointments', async () => {
      const result = await request('/api/v1/my/appointments', {
        headers: {
          'X-Customer-OpenId': CUSTOMER_OPEN_ID
        }
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(Array.isArray(result.json?.items), 'expected items array');

      return {
        count: result.json.items.length
      };
    });

    await runCase('GET /api/v1/staff/appointments?status=pending', async () => {
      const result = await request('/api/v1/staff/appointments?status=pending', {
        headers: {
          'X-Staff-OpenId': STAFF_OPEN_ID
        }
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(Array.isArray(result.json?.items), 'expected items array');

      return {
        count: result.json.items.length
      };
    });

    await runCase('GET /api/v1/staff/appointments/:id -> 404', async () => {
      const result = await request('/api/v1/staff/appointments/__smoke_missing__', {
        headers: {
          'X-Staff-OpenId': STAFF_OPEN_ID
        }
      });

      assert(result.status === 404, `expected 404, got ${result.status}`);
      assert(result.json?.code === 'APPOINTMENT_NOT_FOUND', 'expected APPOINTMENT_NOT_FOUND');

      return result.json;
    });

    await runCase('POST /api/v1/staff/appointments/:id/review -> 404', async () => {
      const result = await request('/api/v1/staff/appointments/__smoke_missing__/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify({
          status: 'approved',
          reviewNote: 'smoke check'
        })
      });

      assert(result.status === 404, `expected 404, got ${result.status}`);
      assert(result.json?.code === 'APPOINTMENT_NOT_FOUND', 'expected APPOINTMENT_NOT_FOUND');

      return result.json;
    });

    await runCase('POST review happy-path -> approved', async () => {
      await prisma.appointment.create({
        data: {
          id: seededAppointmentIds.happy,
          customerOpenId: `customer-happy-${smokeRunId}`,
          customerName: 'Smoke Happy',
          phone: '13800000000',
          date: '2030-03-22',
          timeSlot: '09:00-10:00',
          note: 'happy path',
          status: AppointmentStatus.PENDING
        }
      });

      const result = await request(`/api/v1/staff/appointments/${seededAppointmentIds.happy}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify({
          status: 'approved',
          reviewNote: 'approved in smoke test'
        })
      });

      assert(result.status === 201, `expected 201, got ${result.status}`);
      assert(result.json?.item?.status === 'approved', 'expected approved status');
      assert(result.json?.item?.reviewedBy === STAFF_OPEN_ID, 'expected reviewedBy to match staff');

      return result.json.item;
    });

    await runCase('PATCH review repeated -> APPOINTMENT_ALREADY_REVIEWED', async () => {
      const result = await request(`/api/v1/staff/appointments/${seededAppointmentIds.happy}/review`, {
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
      assert(
        result.json?.code === 'APPOINTMENT_ALREADY_REVIEWED',
        'expected APPOINTMENT_ALREADY_REVIEWED'
      );

      return result.json;
    });

    await runCase('PATCH review slot conflict -> SLOT_OCCUPIED', async () => {
      await prisma.appointment.create({
        data: {
          id: seededAppointmentIds.conflictApproved,
          customerOpenId: `customer-approved-${smokeRunId}`,
          customerName: 'Smoke Occupied',
          phone: '13800000001',
          date: '2030-03-23',
          timeSlot: '10:00-11:00',
          note: 'existing approved slot',
          status: AppointmentStatus.APPROVED,
          reviewedAt: new Date(),
          reviewedByOpenId: STAFF_OPEN_ID,
          reviewNote: 'seed occupied slot'
        }
      });

      await prisma.appointment.create({
        data: {
          id: seededAppointmentIds.conflictPending,
          customerOpenId: `customer-pending-${smokeRunId}`,
          customerName: 'Smoke Pending',
          phone: '13800000002',
          date: '2030-03-23',
          timeSlot: '10:00-11:00',
          note: 'pending conflict slot',
          status: AppointmentStatus.PENDING
        }
      });

      const result = await request(
        `/api/v1/staff/appointments/${seededAppointmentIds.conflictPending}/review`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Staff-OpenId': STAFF_OPEN_ID
          },
          body: JSON.stringify({
            status: 'approved',
            reviewNote: 'should fail due to slot conflict'
          })
        }
      );

      assert(result.status === 409, `expected 409, got ${result.status}`);
      assert(result.json?.code === 'SLOT_OCCUPIED', 'expected SLOT_OCCUPIED');

      return result.json;
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl: BASE_URL,
          cases
        },
        null,
        2
      )
    );
  } finally {
    await prisma.appointment.deleteMany({
      where: {
        id: {
          in: Object.values(seededAppointmentIds)
        }
      }
    });
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
