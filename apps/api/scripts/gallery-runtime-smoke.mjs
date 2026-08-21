import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3100';
const STAFF_OPEN_ID = process.env.STAFF_OPEN_ID || 'staff-openid-demo';
const runId = `${Date.now()}`;
const uniqueTag = `gallery-smoke-${runId}`;
const createdIds = new Set();

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

function staffRequest(path, options = {}) {
  return request(path, {
    ...options,
    headers: {
      'X-Staff-OpenId': STAFF_OPEN_ID,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
}

async function main() {
  const cases = [];
  let activeItem = null;
  let inactiveItem = null;

  async function runCase(name, fn) {
    const detail = await fn();
    cases.push({ name, ok: true, detail });
  }

  try {
    await runCase('GET /api/v1/staff/gallery -> unauthorized without staff identity', async () => {
      const result = await request('/api/v1/staff/gallery');
      assert(result.status === 401, `expected 401, got ${result.status}`);
      assert(result.json?.code === 'STAFF_UNAUTHORIZED', `unexpected code: ${result.json?.code}`);
      return { status: result.status, code: result.json.code };
    });

    await runCase('GET /api/v1/staff/gallery/:id -> missing item is 404', async () => {
      const result = await staffRequest(`/api/v1/staff/gallery/missing-${runId}`);
      assert(result.status === 404, `expected 404, got ${result.status}`);
      assert(result.json?.code === 'GALLERY_ITEM_NOT_FOUND', `unexpected code: ${result.json?.code}`);
      return { status: result.status, code: result.json.code };
    });

    await runCase('DELETE /api/v1/staff/gallery/:id -> unauthorized without staff identity', async () => {
      const result = await request(`/api/v1/staff/gallery/missing-${runId}`, {
        method: 'DELETE'
      });
      assert(result.status === 401, `expected 401, got ${result.status}`);
      assert(result.json?.code === 'STAFF_UNAUTHORIZED', `unexpected code: ${result.json?.code}`);
      return { status: result.status, code: result.json.code };
    });

    await runCase('POST /api/v1/staff/gallery -> reject non-object payload', async () => {
      const result = await staffRequest('/api/v1/staff/gallery', {
        method: 'POST',
        body: '[]'
      });
      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_GALLERY_PAYLOAD', `unexpected code: ${result.json?.code}`);
      return { status: result.status, code: result.json.code };
    });

    await runCase('POST /api/v1/staff/gallery -> create active item', async () => {
      const coverUrl = `https://example.com/${uniqueTag}-cover.jpg`;
      const detailUrl = `https://example.com/${uniqueTag}-detail.jpg`;
      const result = await staffRequest('/api/v1/staff/gallery', {
        method: 'POST',
        body: JSON.stringify({
          title: `返图 smoke ${runId}`,
          imageUrl: coverUrl,
          imageUrls: [coverUrl, detailUrl],
          description: 'gallery runtime smoke active item',
          tags: [uniqueTag, '通勤'],
          publishedAt: new Date().toISOString(),
          sortOrder: 7,
          status: 'active'
        })
      });

      assert(result.status === 201, `expected 201, got ${result.status}: ${result.text}`);
      assert(result.json?.item?.id, 'expected created item id');
      assert(result.json.item.status === 'active', 'expected active status');
      assert(result.json.item.imageUrls?.length === 2, 'expected two image URLs');
      activeItem = result.json.item;
      createdIds.add(activeItem.id);
      return { id: activeItem.id, status: activeItem.status };
    });

    await runCase('GET /api/v1/gallery?tag= -> exact tag filter', async () => {
      const result = await request(`/api/v1/gallery?tag=${encodeURIComponent(uniqueTag)}`);
      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(Array.isArray(result.json?.items), 'expected items array');
      assert(result.json.items.length === 1, `expected one tagged item, got ${result.json.items.length}`);
      assert(result.json.items[0].id === activeItem.id, 'expected created active item');
      return { count: result.json.items.length, id: result.json.items[0].id };
    });

    await runCase('GET /api/v1/gallery?limit=1 -> bounded list', async () => {
      const result = await request('/api/v1/gallery?limit=1');
      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.items?.length === 1, `expected one item, got ${result.json?.items?.length}`);
      return { count: result.json.items.length };
    });

    await runCase('GET /api/v1/gallery?limit=0 -> validation error', async () => {
      const result = await request('/api/v1/gallery?limit=0');
      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_LIMIT', `unexpected code: ${result.json?.code}`);
      return { status: result.status, code: result.json.code };
    });

    await runCase('GET /api/v1/gallery/:id -> public active detail', async () => {
      const result = await request(`/api/v1/gallery/${encodeURIComponent(activeItem.id)}`);
      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.item?.id === activeItem.id, 'expected active detail item');
      assert(result.json.item.tags.includes(uniqueTag), 'expected detail tags');
      return { id: result.json.item.id, imageCount: result.json.item.imageUrls.length };
    });

    await runCase('GET /api/v1/staff/gallery/:id -> staff detail', async () => {
      const result = await staffRequest(`/api/v1/staff/gallery/${encodeURIComponent(activeItem.id)}`);
      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.item?.id === activeItem.id, 'expected staff detail item');
      assert(result.json.item.createdBy === STAFF_OPEN_ID, 'expected createdBy staff identity');
      return { id: result.json.item.id, createdBy: result.json.item.createdBy };
    });

    await runCase('PATCH /api/v1/staff/gallery/:id -> partial update preserves fields', async () => {
      const description = `updated gallery smoke ${runId}`;
      const result = await staffRequest(`/api/v1/staff/gallery/${encodeURIComponent(activeItem.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ description })
      });

      assert(result.status === 200, `expected 200, got ${result.status}: ${result.text}`);
      assert(result.json?.item?.description === description, 'expected updated description');
      assert(result.json.item.title === activeItem.title, 'expected title to be preserved');
      assert(result.json.item.imageUrl === activeItem.imageUrl, 'expected cover to be preserved');
      activeItem = result.json.item;
      return { id: activeItem.id, description: activeItem.description };
    });

    await runCase('PATCH /api/v1/staff/gallery/:id -> reject non-object payload', async () => {
      const result = await staffRequest(`/api/v1/staff/gallery/${encodeURIComponent(activeItem.id)}`, {
        method: 'PATCH',
        body: '[]'
      });
      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_GALLERY_PAYLOAD', `unexpected code: ${result.json?.code}`);
      return { status: result.status, code: result.json.code };
    });

    await runCase('PATCH /api/v1/staff/gallery/:id -> coverImageUrl alias updates cover', async () => {
      const coverImageUrl = `https://example.com/${uniqueTag}-cover-alias.jpg`;
      const result = await staffRequest(`/api/v1/staff/gallery/${encodeURIComponent(activeItem.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ coverImageUrl })
      });

      assert(result.status === 200, `expected 200, got ${result.status}: ${result.text}`);
      assert(result.json?.item?.imageUrl === coverImageUrl, 'expected coverImageUrl alias to update cover');
      assert(result.json.item.imageUrls[0] === coverImageUrl, 'expected new cover first in imageUrls');
      activeItem = result.json.item;
      return { id: activeItem.id, imageUrl: activeItem.imageUrl };
    });

    await runCase('PATCH /api/v1/staff/gallery/:id -> missing item is 404', async () => {
      const result = await staffRequest(`/api/v1/staff/gallery/missing-${runId}`, {
        method: 'PATCH',
        body: JSON.stringify({ description: 'missing item' })
      });
      assert(result.status === 404, `expected 404, got ${result.status}`);
      assert(result.json?.code === 'GALLERY_ITEM_NOT_FOUND', `unexpected code: ${result.json?.code}`);
      return { status: result.status, code: result.json.code };
    });

    await runCase('POST /api/v1/staff/gallery -> reject invalid status', async () => {
      const result = await staffRequest('/api/v1/staff/gallery', {
        method: 'POST',
        body: JSON.stringify({
          title: 'invalid status smoke',
          imageUrl: 'https://example.com/invalid-status-smoke.jpg',
          status: 'archived'
        })
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_GALLERY_STATUS', `unexpected code: ${result.json?.code}`);
      return { status: result.status, code: result.json.code };
    });

    await runCase('POST /api/v1/staff/gallery -> validate required and typed fields', async () => {
      const invalidInputs = [
        {
          payload: { imageUrl: 'https://example.com/missing-title.jpg' },
          code: 'INVALID_GALLERY_TITLE'
        },
        {
          payload: { title: false, imageUrl: 'https://example.com/invalid-title-type.jpg' },
          code: 'INVALID_GALLERY_TITLE'
        },
        {
          payload: { title: 'missing image' },
          code: 'INVALID_GALLERY_IMAGE'
        },
        {
          payload: { title: 'invalid image type', imageUrl: 123 },
          code: 'INVALID_GALLERY_IMAGE'
        },
        {
          payload: { title: 'invalid image array', imageUrls: [123] },
          code: 'INVALID_GALLERY_IMAGE'
        },
        {
          payload: {
            title: 'invalid description type',
            imageUrl: 'https://example.com/invalid-description-type.jpg',
            description: false
          },
          code: 'INVALID_GALLERY_PAYLOAD'
        },
        {
          payload: {
            title: 'invalid tags type',
            imageUrl: 'https://example.com/invalid-tags-type.jpg',
            tags: [false]
          },
          code: 'INVALID_GALLERY_PAYLOAD'
        },
        {
          payload: {
            title: 'invalid publishedAt',
            imageUrl: 'https://example.com/invalid-published-at.jpg',
            publishedAt: 'not-a-date'
          },
          code: 'INVALID_PUBLISHED_AT'
        },
        {
          payload: {
            title: 'invalid sortOrder',
            imageUrl: 'https://example.com/invalid-sort-order.jpg',
            sortOrder: 1.5
          },
          code: 'INVALID_GALLERY_SORT_ORDER'
        }
      ];

      const results = [];
      for (const invalidInput of invalidInputs) {
        const result = await staffRequest('/api/v1/staff/gallery', {
          method: 'POST',
          body: JSON.stringify(invalidInput.payload)
        });
        assert(result.status === 400, `expected 400 for ${invalidInput.code}, got ${result.status}`);
        assert(result.json?.code === invalidInput.code, `expected ${invalidInput.code}, got ${result.json?.code}`);
        results.push(result.json.code);
      }

      return { codes: results };
    });

    await runCase('GET /api/v1/gallery?tag= -> reject oversized tag', async () => {
      const result = await request(`/api/v1/gallery?tag=${'x'.repeat(65)}`);
      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_GALLERY_TAG', `unexpected code: ${result.json?.code}`);
      return { status: result.status, code: result.json.code };
    });

    await runCase('POST /api/v1/staff/gallery -> create inactive item', async () => {
      const imageUrl = `https://example.com/${uniqueTag}-inactive.jpg`;
      const result = await staffRequest('/api/v1/staff/gallery', {
        method: 'POST',
        body: JSON.stringify({
          title: `返图草稿 smoke ${runId}`,
          imageUrl,
          imageUrls: [imageUrl],
          tags: [uniqueTag],
          status: 'inactive'
        })
      });

      assert(result.status === 201, `expected 201, got ${result.status}: ${result.text}`);
      assert(result.json?.item?.status === 'inactive', 'expected inactive status');
      inactiveItem = result.json.item;
      createdIds.add(inactiveItem.id);
      return { id: inactiveItem.id, status: inactiveItem.status };
    });

    await runCase('GET public/staff detail -> inactive visibility boundary', async () => {
      const [publicResult, staffResult] = await Promise.all([
        request(`/api/v1/gallery/${encodeURIComponent(inactiveItem.id)}`),
        staffRequest(`/api/v1/staff/gallery/${encodeURIComponent(inactiveItem.id)}`)
      ]);

      assert(publicResult.status === 404, `expected public 404, got ${publicResult.status}`);
      assert(publicResult.json?.code === 'GALLERY_ITEM_NOT_FOUND', 'expected public not-found code');
      assert(staffResult.status === 200, `expected staff 200, got ${staffResult.status}`);
      assert(staffResult.json?.item?.status === 'inactive', 'expected staff to read inactive item');
      return {
        publicStatus: publicResult.status,
        staffStatus: staffResult.status
      };
    });

    await runCase('DELETE /api/v1/staff/gallery/:id -> delete item', async () => {
      const result = await staffRequest(`/api/v1/staff/gallery/${encodeURIComponent(inactiveItem.id)}`, {
        method: 'DELETE'
      });
      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.item?.id === inactiveItem.id, 'expected deleted item response');
      createdIds.delete(inactiveItem.id);
      return { id: result.json.item.id };
    });

    await runCase('DELETE /api/v1/staff/gallery/:id -> repeated delete is 404', async () => {
      const result = await staffRequest(`/api/v1/staff/gallery/${encodeURIComponent(inactiveItem.id)}`, {
        method: 'DELETE'
      });
      assert(result.status === 404, `expected 404, got ${result.status}`);
      assert(result.json?.code === 'GALLERY_ITEM_NOT_FOUND', `unexpected code: ${result.json?.code}`);
      return { status: result.status, code: result.json.code };
    });

    await runCase('DELETE active item -> public detail becomes 404', async () => {
      const deleteResult = await staffRequest(`/api/v1/staff/gallery/${encodeURIComponent(activeItem.id)}`, {
        method: 'DELETE'
      });
      assert(deleteResult.status === 200, `expected delete 200, got ${deleteResult.status}`);
      createdIds.delete(activeItem.id);

      const detailResult = await request(`/api/v1/gallery/${encodeURIComponent(activeItem.id)}`);
      assert(detailResult.status === 404, `expected detail 404, got ${detailResult.status}`);
      assert(detailResult.json?.code === 'GALLERY_ITEM_NOT_FOUND', 'expected not-found after delete');
      return { deletedId: activeItem.id, detailStatus: detailResult.status };
    });

    console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, cases }, null, 2));
  } finally {
    if (createdIds.size) {
      await prisma.galleryItem.deleteMany({
        where: {
          id: {
            in: [...createdIds]
          }
        }
      });
    }

    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, baseUrl: BASE_URL, error: `${error?.message || error}` }, null, 2));
  process.exit(1);
});
