import { GalleryStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3100';
const runId = `${Date.now()}-${process.pid}`;
const ownerOpenId = `inspiration-smoke-owner-${runId}`;
const otherOpenId = `inspiration-smoke-other-${runId}`;
const concurrentOwnerOpenId = `inspiration-smoke-concurrent-${runId}`;
const paginationOwnerOpenId = `inspiration-smoke-pagination-${runId}`;
const cascadeOwnerOpenId = `inspiration-smoke-cascade-${runId}`;
const galleryTitle = `My inspiration smoke ${runId}`;

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

function customerRequest(customerOpenId, path, options = {}) {
  return request(path, {
    ...options,
    headers: {
      'X-Customer-OpenId': customerOpenId,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const cases = [];
  let galleryItemId = '';
  let inspirationId = '';
  const createdGalleryItemIds = new Set();

  async function createTemporaryGalleryItem(suffix) {
    const imageUrl = `https://example.com/inspiration-smoke-${runId}-${suffix}.jpg`;
    const item = await prisma.galleryItem.create({
      data: {
        title: `${galleryTitle} ${suffix}`,
        imageUrl,
        imageUrlsJson: JSON.stringify([imageUrl]),
        description: `Temporary ${suffix} gallery item for my-inspirations runtime smoke`,
        tagsJson: JSON.stringify(['smoke', runId, suffix]),
        publishedAt: new Date(),
        sortOrder: 0,
        status: GalleryStatus.ACTIVE
      }
    });
    createdGalleryItemIds.add(item.id);
    return item;
  }

  async function runCase(name, fn) {
    const detail = await fn();
    cases.push({ name, ok: true, detail });
  }

  try {
    const galleryItem = await prisma.galleryItem.create({
      data: {
        title: galleryTitle,
        imageUrl: `https://example.com/inspiration-smoke-${runId}-cover.jpg`,
        imageUrlsJson: JSON.stringify([
          `https://example.com/inspiration-smoke-${runId}-cover.jpg`,
          `https://example.com/inspiration-smoke-${runId}-detail.jpg`
        ]),
        description: 'Temporary gallery item for my-inspirations runtime smoke',
        tagsJson: JSON.stringify(['smoke', runId]),
        publishedAt: new Date(),
        sortOrder: 0,
        status: GalleryStatus.ACTIVE
      }
    });
    galleryItemId = galleryItem.id;
    createdGalleryItemIds.add(galleryItemId);

    await runCase('GET /api/v1/my/inspirations -> unauthorized', async () => {
      const result = await request('/api/v1/my/inspirations');
      assert(result.status === 401, `expected 401, got ${result.status}: ${result.text}`);
      assert(
        result.json?.code === 'CUSTOMER_UNAUTHORIZED',
        `expected CUSTOMER_UNAUTHORIZED, got ${result.json?.code}`
      );
      return { status: result.status, code: result.json.code };
    });

    await runCase('POST /api/v1/my/inspirations -> validate payload', async () => {
      const invalidPayloads = [
        {
          payload: {},
          code: 'INVALID_INSPIRATION_GALLERY_ITEM_ID'
        },
        {
          payload: { galleryItemId, note: 42 },
          code: 'INVALID_INSPIRATION_NOTE'
        },
        {
          payload: { galleryItemId, unsupported: true },
          code: 'INVALID_INSPIRATION_CREATE'
        }
      ];
      const codes = [];

      for (const { payload, code } of invalidPayloads) {
        const result = await customerRequest(ownerOpenId, '/api/v1/my/inspirations', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        assert(result.status === 400, `expected 400 for ${code}, got ${result.status}: ${result.text}`);
        assert(result.json?.code === code, `expected ${code}, got ${result.json?.code}`);
        codes.push(result.json.code);
      }

      return { status: 400, codes };
    });

    await runCase('POST /api/v1/my/inspirations -> create', async () => {
      const result = await customerRequest(ownerOpenId, '/api/v1/my/inspirations', {
        method: 'POST',
        body: JSON.stringify({
          galleryItemId,
          note: '  first saved note  '
        })
      });

      assert(result.status === 201, `expected 201, got ${result.status}: ${result.text}`);
      assert(result.json?.item?.id, 'expected created inspiration id');
      assert(result.json.item.galleryItemId === galleryItemId, 'expected matching galleryItemId');
      assert(result.json.item.note === 'first saved note', 'expected trimmed note');
      assert(result.json.item.availability === 'available', 'expected available inspiration');
      assert(result.json.item.galleryItem?.id === galleryItemId, 'expected active gallery item');
      assert(result.json.item.galleryItem.title === galleryTitle, 'expected gallery item fields');
      inspirationId = result.json.item.id;
      return { id: inspirationId, galleryItemId, availability: result.json.item.availability };
    });

    await runCase('POST duplicate -> idempotent and preserves original note', async () => {
      const result = await customerRequest(ownerOpenId, '/api/v1/my/inspirations', {
        method: 'POST',
        body: JSON.stringify({
          galleryItemId,
          note: 'duplicate request must not overwrite the note'
        })
      });

      assert(result.status === 201, `expected 201, got ${result.status}: ${result.text}`);
      assert(result.json?.item?.id === inspirationId, 'expected duplicate POST to return the same item');
      assert(result.json.item.note === 'first saved note', 'expected duplicate POST to preserve note');

      const rows = await prisma.customerInspiration.count({
        where: { customerOpenId: ownerOpenId, galleryItemId }
      });
      assert(rows === 1, `expected one persisted inspiration, got ${rows}`);
      return { id: result.json.item.id, count: rows, note: result.json.item.note };
    });

    await runCase('POST same gallery concurrently -> one id and first persisted note', async () => {
      const concurrentGalleryItem = await createTemporaryGalleryItem('concurrent');
      const requestNotes = Array.from({ length: 8 }, (_, index) => `concurrent note ${index + 1}`);
      const results = await Promise.all(
        requestNotes.map((note) =>
          customerRequest(concurrentOwnerOpenId, '/api/v1/my/inspirations', {
            method: 'POST',
            body: JSON.stringify({ galleryItemId: concurrentGalleryItem.id, note })
          })
        )
      );

      for (const result of results) {
        assert(result.status === 201, `expected concurrent POST 201, got ${result.status}: ${result.text}`);
        assert(result.json?.item?.id, 'expected concurrent POST item id');
      }

      const responseIds = new Set(results.map((result) => result.json.item.id));
      const responseNotes = new Set(results.map((result) => result.json.item.note));
      assert(responseIds.size === 1, `expected one response id, got ${responseIds.size}`);
      assert(responseNotes.size === 1, `expected one response note, got ${responseNotes.size}`);

      const rows = await prisma.customerInspiration.findMany({
        where: {
          customerOpenId: concurrentOwnerOpenId,
          galleryItemId: concurrentGalleryItem.id
        }
      });
      assert(rows.length === 1, `expected one persisted concurrent inspiration, got ${rows.length}`);
      assert(rows[0].id === results[0].json.item.id, 'expected persisted and response ids to match');
      assert(rows[0].note === results[0].json.item.note, 'expected persisted and response notes to match');
      assert(requestNotes.includes(rows[0].note || ''), 'expected persisted note to come from request set');
      return {
        requestCount: results.length,
        responseId: results[0].json.item.id,
        persistedCount: rows.length,
        persistedNote: rows[0].note
      };
    });

    await runCase('GET list and detail -> return owned inspiration', async () => {
      const [listResult, detailResult] = await Promise.all([
        customerRequest(ownerOpenId, '/api/v1/my/inspirations?limit=1'),
        customerRequest(ownerOpenId, `/api/v1/my/inspirations/${encodeURIComponent(inspirationId)}`)
      ]);

      assert(listResult.status === 200, `expected list 200, got ${listResult.status}: ${listResult.text}`);
      assert(Array.isArray(listResult.json?.items), 'expected list items array');
      assert(listResult.json.items.length === 1, `expected one list item, got ${listResult.json.items.length}`);
      assert(listResult.json.items[0].id === inspirationId, 'expected created item in list');
      assert(listResult.json?.pageInfo?.hasMore === false, 'expected hasMore=false');
      assert(listResult.json.pageInfo.nextCursor === null, 'expected nextCursor=null');

      assert(detailResult.status === 200, `expected detail 200, got ${detailResult.status}: ${detailResult.text}`);
      assert(detailResult.json?.item?.id === inspirationId, 'expected owned detail item');
      assert(detailResult.json.item.galleryItem?.imageUrls?.length === 2, 'expected gallery image URLs');
      return {
        listCount: listResult.json.items.length,
        detailId: detailResult.json.item.id,
        pageInfo: listResult.json.pageInfo
      };
    });

    await runCase('GET cursor pages -> stable after boundary deletion and owner-bound', async () => {
      const paginationGalleryItems = [];
      for (let index = 1; index <= 3; index += 1) {
        paginationGalleryItems.push(await createTemporaryGalleryItem(`cursor-${index}`));
      }

      const createdPaginationIds = [];
      for (const [index, item] of paginationGalleryItems.entries()) {
        const createResult = await customerRequest(paginationOwnerOpenId, '/api/v1/my/inspirations', {
          method: 'POST',
          body: JSON.stringify({
            galleryItemId: item.id,
            note: `pagination note ${index + 1}`
          })
        });
        assert(createResult.status === 201, `expected pagination create 201, got ${createResult.status}`);
        createdPaginationIds.push(createResult.json?.item?.id);
      }

      const firstPage = await customerRequest(
        paginationOwnerOpenId,
        '/api/v1/my/inspirations?limit=1'
      );
      assert(firstPage.status === 200, `expected first page 200, got ${firstPage.status}: ${firstPage.text}`);
      assert(firstPage.json?.items?.length === 1, 'expected one item on first page');
      assert(firstPage.json?.pageInfo?.hasMore === true, 'expected first page hasMore=true');
      assert(firstPage.json.pageInfo.nextCursor, 'expected first page nextCursor');
      const firstCursor = firstPage.json.pageInfo.nextCursor;

      const secondPage = await customerRequest(
        paginationOwnerOpenId,
        `/api/v1/my/inspirations?limit=1&cursor=${encodeURIComponent(firstCursor)}`
      );
      assert(secondPage.status === 200, `expected second page 200, got ${secondPage.status}: ${secondPage.text}`);
      assert(secondPage.json?.items?.length === 1, 'expected one item on second page');
      assert(secondPage.json?.pageInfo?.hasMore === true, 'expected second page hasMore=true');
      assert(secondPage.json.pageInfo.nextCursor, 'expected second page nextCursor');
      const secondCursor = secondPage.json.pageInfo.nextCursor;

      const thirdPage = await customerRequest(
        paginationOwnerOpenId,
        `/api/v1/my/inspirations?limit=1&cursor=${encodeURIComponent(secondCursor)}`
      );
      assert(thirdPage.status === 200, `expected third page 200, got ${thirdPage.status}: ${thirdPage.text}`);
      assert(thirdPage.json?.items?.length === 1, 'expected one item on third page');
      assert(thirdPage.json?.pageInfo?.hasMore === false, 'expected third page hasMore=false');
      assert(thirdPage.json.pageInfo.nextCursor === null, 'expected third page nextCursor=null');

      const walkedIds = [
        firstPage.json.items[0].id,
        secondPage.json.items[0].id,
        thirdPage.json.items[0].id
      ];
      assert(new Set(walkedIds).size === 3, 'expected no duplicate items while consuming cursor pages');
      assert(
        createdPaginationIds.every((id) => walkedIds.includes(id)),
        'expected cursor pages to contain every created pagination item'
      );

      const deleteResult = await customerRequest(
        paginationOwnerOpenId,
        `/api/v1/my/inspirations/${encodeURIComponent(walkedIds[0])}`,
        { method: 'DELETE' }
      );
      assert(deleteResult.status === 200, `expected cursor boundary delete 200, got ${deleteResult.status}`);

      const afterBoundaryDelete = await customerRequest(
        paginationOwnerOpenId,
        `/api/v1/my/inspirations?limit=1&cursor=${encodeURIComponent(firstCursor)}`
      );
      assert(
        afterBoundaryDelete.status === 200,
        `expected deleted-boundary cursor 200, got ${afterBoundaryDelete.status}: ${afterBoundaryDelete.text}`
      );
      assert(afterBoundaryDelete.json?.items?.length === 1, 'expected next page after boundary deletion');
      assert(
        afterBoundaryDelete.json.items[0].id === walkedIds[1],
        'expected deleted-boundary cursor to resume at the same next item'
      );

      const otherOwnerResult = await customerRequest(
        otherOpenId,
        `/api/v1/my/inspirations?limit=1&cursor=${encodeURIComponent(firstCursor)}`
      );
      assert(otherOwnerResult.status === 400, `expected cross-owner cursor 400, got ${otherOwnerResult.status}`);
      assert(
        otherOwnerResult.json?.code === 'INVALID_INSPIRATION_CURSOR',
        `expected INVALID_INSPIRATION_CURSOR, got ${otherOwnerResult.json?.code}`
      );

      const malformedResult = await customerRequest(
        paginationOwnerOpenId,
        `/api/v1/my/inspirations?limit=1&cursor=${encodeURIComponent('not-a-valid-cursor')}`
      );
      assert(malformedResult.status === 400, `expected malformed cursor 400, got ${malformedResult.status}`);
      assert(
        malformedResult.json?.code === 'INVALID_INSPIRATION_CURSOR',
        `expected INVALID_INSPIRATION_CURSOR, got ${malformedResult.json?.code}`
      );

      const decodedCursor = JSON.parse(
        Buffer.from(firstCursor, 'base64url').toString('utf8')
      );
      const outOfRangeCursor = Buffer.from(
        JSON.stringify({
          ...decodedCursor,
          c: '+010000-01-01T00:00:00.000Z'
        })
      ).toString('base64url');
      const outOfRangeResult = await customerRequest(
        paginationOwnerOpenId,
        `/api/v1/my/inspirations?limit=1&cursor=${encodeURIComponent(outOfRangeCursor)}`
      );
      assert(
        outOfRangeResult.status === 400,
        `expected out-of-range cursor 400, got ${outOfRangeResult.status}: ${outOfRangeResult.text}`
      );
      assert(
        outOfRangeResult.json?.code === 'INVALID_INSPIRATION_CURSOR',
        `expected INVALID_INSPIRATION_CURSOR, got ${outOfRangeResult.json?.code}`
      );

      const malformedIdCursor = Buffer.from(
        JSON.stringify({
          ...decodedCursor,
          i: '\ud800'
        })
      ).toString('base64url');
      const malformedIdResult = await customerRequest(
        paginationOwnerOpenId,
        `/api/v1/my/inspirations?limit=1&cursor=${encodeURIComponent(malformedIdCursor)}`
      );
      assert(
        malformedIdResult.status === 400,
        `expected malformed id cursor 400, got ${malformedIdResult.status}: ${malformedIdResult.text}`
      );
      assert(
        malformedIdResult.json?.code === 'INVALID_INSPIRATION_CURSOR',
        `expected INVALID_INSPIRATION_CURSOR, got ${malformedIdResult.json?.code}`
      );

      return {
        walkedIds,
        uniqueCount: new Set(walkedIds).size,
        resumedId: afterBoundaryDelete.json.items[0].id,
        crossOwnerCode: otherOwnerResult.json.code,
        malformedCode: malformedResult.json.code,
        outOfRangeCode: outOfRangeResult.json.code,
        malformedIdCode: malformedIdResult.json.code
      };
    });

    await runCase('PATCH /api/v1/my/inspirations/:id -> validate and update note', async () => {
      const invalidResult = await customerRequest(
        ownerOpenId,
        `/api/v1/my/inspirations/${encodeURIComponent(inspirationId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({})
        }
      );
      assert(invalidResult.status === 400, `expected invalid update 400, got ${invalidResult.status}`);
      assert(
        invalidResult.json?.code === 'INVALID_INSPIRATION_UPDATE',
        `expected INVALID_INSPIRATION_UPDATE, got ${invalidResult.json?.code}`
      );

      const result = await customerRequest(
        ownerOpenId,
        `/api/v1/my/inspirations/${encodeURIComponent(inspirationId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ note: '  updated saved note  ' })
        }
      );
      assert(result.status === 200, `expected 200, got ${result.status}: ${result.text}`);
      assert(result.json?.item?.id === inspirationId, 'expected updated item');
      assert(result.json.item.note === 'updated saved note', 'expected trimmed updated note');
      return { id: result.json.item.id, note: result.json.item.note };
    });

    await runCase('other customer -> detail, update and delete are 404', async () => {
      const encodedId = encodeURIComponent(inspirationId);
      const [detailResult, updateResult, deleteResult] = await Promise.all([
        customerRequest(otherOpenId, `/api/v1/my/inspirations/${encodedId}`),
        customerRequest(otherOpenId, `/api/v1/my/inspirations/${encodedId}`, {
          method: 'PATCH',
          body: JSON.stringify({ note: 'not owned' })
        }),
        customerRequest(otherOpenId, `/api/v1/my/inspirations/${encodedId}`, {
          method: 'DELETE'
        })
      ]);

      for (const result of [detailResult, updateResult, deleteResult]) {
        assert(result.status === 404, `expected ownership 404, got ${result.status}: ${result.text}`);
        assert(
          result.json?.code === 'INSPIRATION_NOT_FOUND',
          `expected INSPIRATION_NOT_FOUND, got ${result.json?.code}`
        );
      }

      return { detail: detailResult.status, update: updateResult.status, delete: deleteResult.status };
    });

    await runCase('hard delete gallery item -> cascade inspiration relation', async () => {
      const cascadeGalleryItem = await createTemporaryGalleryItem('cascade');
      const createResult = await customerRequest(cascadeOwnerOpenId, '/api/v1/my/inspirations', {
        method: 'POST',
        body: JSON.stringify({
          galleryItemId: cascadeGalleryItem.id,
          note: 'cascade relation smoke'
        })
      });
      assert(createResult.status === 201, `expected cascade create 201, got ${createResult.status}`);

      const beforeDelete = await prisma.customerInspiration.count({
        where: {
          customerOpenId: cascadeOwnerOpenId,
          galleryItemId: cascadeGalleryItem.id
        }
      });
      assert(beforeDelete === 1, `expected one relation before gallery delete, got ${beforeDelete}`);

      await prisma.galleryItem.delete({ where: { id: cascadeGalleryItem.id } });
      const afterDelete = await prisma.customerInspiration.count({
        where: {
          customerOpenId: cascadeOwnerOpenId,
          galleryItemId: cascadeGalleryItem.id
        }
      });
      assert(afterDelete === 0, `expected cascade relation count 0, got ${afterDelete}`);
      return { galleryItemId: cascadeGalleryItem.id, beforeDelete, afterDelete };
    });

    await runCase('inactive gallery -> hide gallery fields but preserve saved record', async () => {
      await prisma.galleryItem.update({
        where: { id: galleryItemId },
        data: { status: GalleryStatus.INACTIVE }
      });

      const [detailResult, listResult, createResult] = await Promise.all([
        customerRequest(ownerOpenId, `/api/v1/my/inspirations/${encodeURIComponent(inspirationId)}`),
        customerRequest(ownerOpenId, '/api/v1/my/inspirations'),
        customerRequest(otherOpenId, '/api/v1/my/inspirations', {
          method: 'POST',
          body: JSON.stringify({ galleryItemId })
        })
      ]);

      assert(detailResult.status === 200, `expected detail 200, got ${detailResult.status}: ${detailResult.text}`);
      assert(detailResult.json?.item?.availability === 'unavailable', 'expected unavailable detail');
      assert(detailResult.json.item.galleryItem === null, 'expected hidden inactive gallery detail');

      const listItem = listResult.json?.items?.find((item) => item.id === inspirationId);
      assert(listResult.status === 200, `expected list 200, got ${listResult.status}: ${listResult.text}`);
      assert(listItem?.availability === 'unavailable', 'expected unavailable list item');
      assert(listItem.galleryItem === null, 'expected hidden inactive gallery item in list');

      assert(createResult.status === 404, `expected inactive create 404, got ${createResult.status}`);
      assert(
        createResult.json?.code === 'GALLERY_ITEM_NOT_AVAILABLE',
        `expected GALLERY_ITEM_NOT_AVAILABLE, got ${createResult.json?.code}`
      );
      return {
        detailAvailability: detailResult.json.item.availability,
        galleryItem: detailResult.json.item.galleryItem,
        createStatus: createResult.status
      };
    });

    await runCase('DELETE then GET -> deleted item is 404', async () => {
      const path = `/api/v1/my/inspirations/${encodeURIComponent(inspirationId)}`;
      const deleteResult = await customerRequest(ownerOpenId, path, { method: 'DELETE' });
      assert(deleteResult.status === 200, `expected delete 200, got ${deleteResult.status}: ${deleteResult.text}`);
      assert(deleteResult.json?.item?.id === inspirationId, 'expected deleted item response');

      const [detailResult, listResult] = await Promise.all([
        customerRequest(ownerOpenId, path),
        customerRequest(ownerOpenId, '/api/v1/my/inspirations')
      ]);
      assert(detailResult.status === 404, `expected deleted detail 404, got ${detailResult.status}`);
      assert(
        detailResult.json?.code === 'INSPIRATION_NOT_FOUND',
        `expected INSPIRATION_NOT_FOUND, got ${detailResult.json?.code}`
      );
      assert(listResult.status === 200, `expected list 200, got ${listResult.status}`);
      assert(listResult.json?.items?.length === 0, 'expected empty list after delete');
      return { id: inspirationId, detailStatus: detailResult.status, listCount: listResult.json.items.length };
    });

    console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, cases }, null, 2));
  } finally {
    await prisma.customerInspiration.deleteMany({
      where: {
        OR: [
          {
            customerOpenId: {
              in: [
                ownerOpenId,
                otherOpenId,
                concurrentOwnerOpenId,
                paginationOwnerOpenId,
                cascadeOwnerOpenId
              ]
            }
          },
          ...(createdGalleryItemIds.size
            ? [{ galleryItemId: { in: [...createdGalleryItemIds] } }]
            : [])
        ]
      }
    });

    if (createdGalleryItemIds.size) {
      await prisma.galleryItem.deleteMany({
        where: { id: { in: [...createdGalleryItemIds] } }
      });
    }

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
