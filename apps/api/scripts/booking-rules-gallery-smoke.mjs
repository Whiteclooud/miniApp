import { PrismaClient, GalleryStatus } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3100';
const STAFF_OPEN_ID = process.env.STAFF_OPEN_ID || 'staff-openid-demo';
const runId = `${Date.now()}`;

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
  const cases = [];
  let originalRule = null;
  let restoreRulePayload = null;
  let activeGalleryIds = [];
  let temporaryInactiveGalleryId = null;

  async function runCase(name, fn) {
    const detail = await fn();
    cases.push({ name, ok: true, detail });
  }

  try {
    await runCase('GET /api/v1/staff/booking-rules -> current rule', async () => {
      const result = await request('/api/v1/staff/booking-rules', {
        headers: { 'X-Staff-OpenId': STAFF_OPEN_ID }
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.item, 'expected booking rule item');
      originalRule = result.json.item;
      restoreRulePayload = {
        advanceOpenDays: Number(originalRule.advanceOpenDays || 0),
        closedDates: Array.isArray(originalRule.closedDates) ? originalRule.closedDates : [],
        dailySlots: Array.isArray(originalRule.dailySlots) ? originalRule.dailySlots : [],
        weeklyOpenDays: Array.isArray(originalRule.weeklyOpenDays) ? originalRule.weeklyOpenDays : [],
        sameDayCutoffTime: originalRule.sameDayCutoffTime || '',
        minAdvanceHours: Number(originalRule.minAdvanceHours || 0),
        dateSlotOverrides:
          originalRule.dateSlotOverrides && typeof originalRule.dateSlotOverrides === 'object'
            ? originalRule.dateSlotOverrides
            : {}
      };
      return originalRule;
    });

    await runCase('PUT /api/v1/staff/booking-rules -> save and read back', async () => {
      const payload = {
        advanceOpenDays: 3,
        closedDates: [],
        dailySlots: ['10:00-11:00', '14:00-15:00'],
        weeklyOpenDays: [1, 2, 3, 4, 5],
        sameDayCutoffTime: '18:00',
        minAdvanceHours: 2,
        dateSlotOverrides: {
          '2099-12-31': ['12:00-13:00']
        }
      };
      const putResult = await request('/api/v1/staff/booking-rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify(payload)
      });

      assert(putResult.status === 200, `expected 200, got ${putResult.status}`);
      assert(putResult.json?.item?.advanceOpenDays === payload.advanceOpenDays, 'expected updated advanceOpenDays');
      assert(JSON.stringify(putResult.json?.item?.dailySlots || []) === JSON.stringify(payload.dailySlots), 'expected updated dailySlots');
      assert(JSON.stringify(putResult.json?.item?.weeklyOpenDays || []) === JSON.stringify(payload.weeklyOpenDays), 'expected updated weeklyOpenDays');
      assert(putResult.json?.item?.sameDayCutoffTime === payload.sameDayCutoffTime, 'expected updated sameDayCutoffTime');
      assert(putResult.json?.item?.minAdvanceHours === payload.minAdvanceHours, 'expected updated minAdvanceHours');
      assert(JSON.stringify(putResult.json?.item?.dateSlotOverrides || {}) === JSON.stringify(payload.dateSlotOverrides), 'expected updated dateSlotOverrides');

      const getResult = await request('/api/v1/staff/booking-rules', {
        headers: { 'X-Staff-OpenId': STAFF_OPEN_ID }
      });

      assert(getResult.status === 200, `expected 200, got ${getResult.status}`);
      assert(getResult.json?.item?.advanceOpenDays === payload.advanceOpenDays, 'expected saved advanceOpenDays on readback');
      assert(JSON.stringify(getResult.json?.item?.dailySlots || []) === JSON.stringify(payload.dailySlots), 'expected saved dailySlots on readback');
      assert(JSON.stringify(getResult.json?.item?.weeklyOpenDays || []) === JSON.stringify(payload.weeklyOpenDays), 'expected saved weeklyOpenDays on readback');
      assert(getResult.json?.item?.sameDayCutoffTime === payload.sameDayCutoffTime, 'expected saved sameDayCutoffTime on readback');
      assert(getResult.json?.item?.minAdvanceHours === payload.minAdvanceHours, 'expected saved minAdvanceHours on readback');
      assert(JSON.stringify(getResult.json?.item?.dateSlotOverrides || {}) === JSON.stringify(payload.dateSlotOverrides), 'expected saved dateSlotOverrides on readback');
      return getResult.json.item;
    });

    await runCase('PUT /api/v1/staff/booking-rules -> reject invalid clock range', async () => {
      const result = await request('/api/v1/staff/booking-rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify({
          advanceOpenDays: 3,
          closedDates: [],
          dailySlots: ['24:00-25:00']
        })
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_SLOT', `expected INVALID_SLOT, got ${result.json?.code}`);
      return result.json;
    });

    await runCase('PUT /api/v1/staff/booking-rules -> reject non-string cutoff time', async () => {
      const result = await request('/api/v1/staff/booking-rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify({
          advanceOpenDays: 3,
          closedDates: [],
          dailySlots: ['10:00-11:00'],
          sameDayCutoffTime: false
        })
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_SAME_DAY_CUTOFF_TIME', `expected INVALID_SAME_DAY_CUTOFF_TIME, got ${result.json?.code}`);
      return result.json;
    });

    await runCase('PUT /api/v1/staff/booking-rules -> reject null weekly open days', async () => {
      const result = await request('/api/v1/staff/booking-rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify({
          advanceOpenDays: 3,
          closedDates: [],
          dailySlots: ['10:00-11:00'],
          weeklyOpenDays: null
        })
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_WEEKLY_OPEN_DAYS', `expected INVALID_WEEKLY_OPEN_DAYS, got ${result.json?.code}`);
      return result.json;
    });

    await runCase('PUT /api/v1/staff/booking-rules -> reject malformed override object', async () => {
      const result = await request('/api/v1/staff/booking-rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify({
          advanceOpenDays: 3,
          closedDates: [],
          dailySlots: ['10:00-11:00'],
          dateSlotOverrides: []
        })
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_DATE_SLOT_OVERRIDES', `expected INVALID_DATE_SLOT_OVERRIDES, got ${result.json?.code}`);
      return result.json;
    });

    await runCase('PUT /api/v1/staff/booking-rules -> reject invalid override slot type', async () => {
      const result = await request('/api/v1/staff/booking-rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify({
          advanceOpenDays: 3,
          closedDates: [],
          dailySlots: ['10:00-11:00'],
          dateSlotOverrides: {
            '2030-04-01': [1000]
          }
        })
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_DATE_SLOT_OVERRIDES', `expected INVALID_DATE_SLOT_OVERRIDES, got ${result.json?.code}`);
      return result.json;
    });

    await runCase('GET /api/v1/availability -> reflects future date window after save', async () => {
      const result = await request('/api/v1/availability');
      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(Array.isArray(result.json?.dateOptions), 'expected dateOptions array');
      assert(result.json.dateOptions.length === 4, `expected 4 date options, got ${result.json.dateOptions.length}`);
      assert(Array.isArray(result.json?.items), 'expected items array');
      return {
        selectedDate: result.json.selectedDate,
        dateOptionsCount: result.json.dateOptions.length,
        itemsCount: result.json.items.length
      };
    });

    await runCase('GET /api/v1/gallery -> empty list when no active rows exist', async () => {
      const activeRows = await prisma.galleryItem.findMany({
        where: { status: GalleryStatus.ACTIVE },
        select: { id: true }
      });
      activeGalleryIds = activeRows.map((item) => item.id);

      temporaryInactiveGalleryId = `gallery-inactive-only-${runId}`;
      await prisma.galleryItem.create({
        data: {
          id: temporaryInactiveGalleryId,
          title: 'inactive-only-smoke',
          imageUrl: 'https://example.com/inactive-only-smoke-cover.jpg',
          imageUrlsJson: JSON.stringify(['https://example.com/inactive-only-smoke-cover.jpg']),
          tagsJson: JSON.stringify(['smoke']),
          sortOrder: 999,
          status: GalleryStatus.INACTIVE
        }
      });

      if (activeGalleryIds.length) {
        await prisma.galleryItem.updateMany({
          where: { id: { in: activeGalleryIds } },
          data: { status: GalleryStatus.INACTIVE }
        });
      }

      const result = await request('/api/v1/gallery');
      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(Array.isArray(result.json?.items), 'expected items array');
      assert(result.json.items.length === 0, `expected empty gallery, got ${result.json.items.length}`);
      return {
        inactiveOnlyCount: result.json.items.length
      };
    });

    console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, cases }, null, 2));
  } finally {
    if (activeGalleryIds.length) {
      await prisma.galleryItem.updateMany({
        where: { id: { in: activeGalleryIds } },
        data: { status: GalleryStatus.ACTIVE }
      });
    }

    if (temporaryInactiveGalleryId) {
      await prisma.galleryItem.deleteMany({ where: { id: temporaryInactiveGalleryId } });
    }

    if (restoreRulePayload) {
      await request('/api/v1/staff/booking-rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Staff-OpenId': STAFF_OPEN_ID
        },
        body: JSON.stringify(restoreRulePayload)
      }).catch(() => null);
    }

    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, baseUrl: BASE_URL, error: `${error?.message || error}` }, null, 2));
  process.exit(1);
});
