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
        dailySlots: Array.isArray(originalRule.dailySlots) ? originalRule.dailySlots : []
      };
      return originalRule;
    });

    await runCase('PUT /api/v1/staff/booking-rules -> save and read back', async () => {
      const payload = {
        advanceOpenDays: 3,
        closedDates: [],
        dailySlots: ['10:00-11:00', '14:00-15:00']
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

      const getResult = await request('/api/v1/staff/booking-rules', {
        headers: { 'X-Staff-OpenId': STAFF_OPEN_ID }
      });

      assert(getResult.status === 200, `expected 200, got ${getResult.status}`);
      assert(getResult.json?.item?.advanceOpenDays === payload.advanceOpenDays, 'expected saved advanceOpenDays on readback');
      assert(JSON.stringify(getResult.json?.item?.dailySlots || []) === JSON.stringify(payload.dailySlots), 'expected saved dailySlots on readback');
      return getResult.json.item;
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

    await runCase('GET /api/v1/gallery -> fallback still visible when no active rows exist', async () => {
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
      assert(result.json.items.length >= 1, 'expected fallback gallery items');
      return {
        inactiveOnlyFallbackCount: result.json.items.length,
        firstItemId: result.json.items[0]?.id || ''
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
