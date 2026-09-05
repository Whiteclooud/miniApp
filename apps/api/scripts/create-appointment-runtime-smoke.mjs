import { PrismaClient, AppointmentStatus } from '@prisma/client';
import { createHash } from 'node:crypto';

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
  const cancelReleaseDate = '2030-03-26';
  const outOfRangeDate = '2050-03-22';
  const sharedTimeSlot = '10:00-11:00';
  const secondTimeSlot = '14:00-15:00';
  const bookingRuleId = `rule-${runId}`;
  const approvedConflictId = `approved-${runId}`;
  const cleanupCustomerPrefix = `cust-${runId}`;
  const referenceCustomerOpenId = `${cleanupCustomerPrefix}-reference-images`;
  const referenceImageUrls = [
    `https://example.com/reference-${runId}.jpg`,
    `https://example.com/reference-${runId}.webp`
  ];
  let referenceAppointmentId = '';
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
        dailySlotsJson: JSON.stringify([sharedTimeSlot, secondTimeSlot]),
        weeklyOpenDaysJson: JSON.stringify([0, 1, 2, 3, 4, 5, 6]),
        sameDayCutoffTime: null,
        minAdvanceHours: 0,
        dateSlotOverridesJson: JSON.stringify({})
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

    await runCase('create rejects non-array referenceImageUrls', async () => {
      const result = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': `${cleanupCustomerPrefix}-invalid-reference-images`
        },
        body: JSON.stringify({
          appointmentDate: openDate,
          timeSlot: sharedTimeSlot,
          referenceImageUrls: referenceImageUrls[0]
        })
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_REFERENCE_IMAGE_URLS', 'expected INVALID_REFERENCE_IMAGE_URLS');
      return result.json;
    });

    await runCase('create enforces six reference image limit', async () => {
      const result = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': `${cleanupCustomerPrefix}-too-many-reference-images`
        },
        body: JSON.stringify({
          appointmentDate: openDate,
          timeSlot: sharedTimeSlot,
          referenceImageUrls: Array.from(
            { length: 7 },
            (_, index) => `https://example.com/reference-${runId}-${index}.jpg`
          )
        })
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(
        result.json?.code === 'REFERENCE_IMAGE_COUNT_EXCEEDED',
        'expected REFERENCE_IMAGE_COUNT_EXCEEDED'
      );
      return result.json;
    });

    await runCase('create rejects another customer upload URL', async () => {
      const ownerOpenId = `${cleanupCustomerPrefix}-reference-owner`;
      const otherOwnerHash = createHash('sha256')
        .update(`${cleanupCustomerPrefix}-another-customer`)
        .digest('hex');
      const result = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': ownerOpenId
        },
        body: JSON.stringify({
          appointmentDate: openDate,
          timeSlot: sharedTimeSlot,
          referenceImageUrls: [
            `${BASE_URL}/api/v1/uploads/images/customer-${otherOwnerHash}-1700000000000-aabbccddeeffaabbccddeeff.jpg`
          ]
        })
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'REFERENCE_IMAGE_FORBIDDEN', 'expected REFERENCE_IMAGE_FORBIDDEN');
      return result.json;
    });

    await runCase('create with reference images -> persists JSON', async () => {
      const result = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': referenceCustomerOpenId
        },
        body: JSON.stringify({
          appointmentDate: openDate,
          timeSlot: sharedTimeSlot,
          customerName: 'Reference Images',
          referenceImageUrls
        })
      });

      assert(result.status === 201, `expected 201, got ${result.status}`);
      assert(
        JSON.stringify(result.json?.item?.referenceImageUrls) === JSON.stringify(referenceImageUrls),
        'expected referenceImageUrls in create response'
      );
      referenceAppointmentId = `${result.json?.item?.id || ''}`;
      assert(referenceAppointmentId, 'expected reference appointment id');

      const stored = await prisma.appointment.findUnique({
        where: { id: referenceAppointmentId },
        select: { referenceImageUrlsJson: true }
      });
      assert(
        JSON.stringify(JSON.parse(stored?.referenceImageUrlsJson || '[]')) === JSON.stringify(referenceImageUrls),
        'expected persisted reference image JSON'
      );

      return result.json.item;
    });

    await runCase('my appointments returns reference images', async () => {
      const result = await request('/api/v1/my/appointments', {
        headers: {
          'X-Customer-OpenId': referenceCustomerOpenId
        }
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      const item = (result.json?.items || []).find((entry) => entry.id === referenceAppointmentId);
      assert(item, 'expected reference appointment in customer list');
      assert(
        JSON.stringify(item.referenceImageUrls) === JSON.stringify(referenceImageUrls),
        'expected referenceImageUrls in customer list'
      );
      return item;
    });

    await runCase('staff appointment list returns reference images', async () => {
      const result = await request(
        `/api/v1/staff/appointments?keyword=${encodeURIComponent(referenceCustomerOpenId)}`,
        {
          headers: {
            'X-Staff-OpenId': 'staff-openid-demo'
          }
        }
      );

      assert(result.status === 200, `expected 200, got ${result.status}`);
      const item = (result.json?.items || []).find((entry) => entry.id === referenceAppointmentId);
      assert(item, 'expected reference appointment in staff list');
      assert(
        JSON.stringify(item.referenceImageUrls) === JSON.stringify(referenceImageUrls),
        'expected referenceImageUrls in staff list'
      );
      return item;
    });

    await runCase('staff appointment detail returns reference images', async () => {
      const result = await request(`/api/v1/staff/appointments/${referenceAppointmentId}`, {
        headers: {
          'X-Staff-OpenId': 'staff-openid-demo'
        }
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(
        JSON.stringify(result.json?.item?.referenceImageUrls) === JSON.stringify(referenceImageUrls),
        'expected referenceImageUrls in staff detail'
      );
      return result.json.item;
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

    await runCase('approved appointment can be cancelled by customer and releases slot', async () => {
      const customerOpenId = `${cleanupCustomerPrefix}-cancel-release`;
      const createResult = await request('/api/v1/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': customerOpenId
        },
        body: JSON.stringify({
          appointmentDate: cancelReleaseDate,
          timeSlot: sharedTimeSlot,
          customerName: 'Cancel Release'
        })
      });

      assert(createResult.status === 201, `expected create 201, got ${createResult.status}`);
      const appointmentId = createResult.json?.item?.id;
      const approveResult = await request(`/api/v1/staff/appointments/${appointmentId}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': 'staff-openid-demo'
        },
        body: JSON.stringify({ status: 'approved', reviewNote: 'approve before cancel' })
      });

      assert(approveResult.status === 200, `expected approve 200, got ${approveResult.status}`);
      assert(approveResult.json?.item?.status === 'approved', 'expected approved before cancel');

      const cancelResult = await request(`/api/v1/my/appointments/${appointmentId}/cancel`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Customer-OpenId': customerOpenId
        },
        body: JSON.stringify({ reason: 'smoke cancel' })
      });

      assert(cancelResult.status === 200, `expected cancel 200, got ${cancelResult.status}`);
      assert(cancelResult.json?.item?.status === 'cancelled', 'expected cancelled status');

      const availabilityResult = await request(`/api/v1/availability?date=${cancelReleaseDate}`);
      const releasedSlot = (availabilityResult.json?.items || []).find((item) => item.timeSlot === sharedTimeSlot);
      assert(releasedSlot?.status === 'active', 'expected cancelled approved slot to be active again');

      return {
        appointmentId,
        releasedSlot
      };
    });

    console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, cases }, null, 2));
  } finally {
    const cleanupAppointments = await prisma.appointment.findMany({
      where: {
        OR: [
          { id: approvedConflictId },
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
