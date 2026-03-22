const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3100';
const STAFF_OPEN_ID = process.env.STAFF_OPEN_ID || 'staff-openid-demo';
const CUSTOMER_OPEN_ID = process.env.CUSTOMER_OPEN_ID || 'openid-smoke-customer';

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
