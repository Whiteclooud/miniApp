import { createHash } from 'node:crypto';
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3100';
const STAFF_OPEN_ID = process.env.STAFF_OPEN_ID || 'staff-openid-demo';
const runId = `${Date.now()}`;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
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

  return { status: response.status, ok: response.ok, json, text };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function createSession(openId, role, token) {
  const user = await prisma.user.upsert({
    where: { openId },
    update: { role, status: UserStatus.ACTIVE },
    create: { openId, role, status: UserStatus.ACTIVE }
  });

  const session = await prisma.authSession.create({
    data: {
      tokenHash: sha256(token),
      userId: user.id,
      openId,
      role,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    }
  });

  return { user, session };
}

async function main() {
  const cases = [];
  const customerOpenId = `auth-customer-${runId}`;
  const customerToken = `auth-customer-token-${runId}`;
  const blockedCustomerToken = `auth-blocked-customer-token-${runId}`;
  const staffToken = `auth-staff-token-${runId}`;
  const tokenHashes = [customerToken, blockedCustomerToken, staffToken].map(sha256);

  async function runCase(name, fn) {
    const detail = await fn();
    cases.push({ name, ok: true, detail });
  }

  try {
    await createSession(customerOpenId, UserRole.CUSTOMER, customerToken);
    await createSession(`auth-blocked-customer-${runId}`, UserRole.CUSTOMER, blockedCustomerToken);
    await createSession(STAFF_OPEN_ID, UserRole.STAFF, staffToken);

    await runCase('GET /api/v1/auth/me with bearer -> current customer', async () => {
      const result = await request('/api/v1/auth/me', {
        headers: {
          Authorization: `Bearer ${customerToken}`
        }
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.user?.openId === customerOpenId, 'expected customer openId');
      assert(result.json?.user?.role === 'customer', 'expected customer role');
      return result.json;
    });

    await runCase('staff bearer can access staff endpoint', async () => {
      const result = await request('/api/v1/staff/booking-rules', {
        headers: {
          Authorization: `Bearer ${staffToken}`
        }
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.item, 'expected booking rules item');
      return {
        advanceOpenDays: result.json.item.advanceOpenDays
      };
    });

    await runCase('customer bearer cannot access staff endpoint', async () => {
      const result = await request('/api/v1/staff/appointments', {
        headers: {
          Authorization: `Bearer ${blockedCustomerToken}`
        }
      });

      assert(result.status === 401, `expected 401, got ${result.status}`);
      assert(result.json?.code === 'STAFF_UNAUTHORIZED', 'expected STAFF_UNAUTHORIZED');
      return result.json;
    });

    await runCase('POST /api/v1/auth/logout invalidates bearer token', async () => {
      const logoutResult = await request('/api/v1/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${customerToken}`
        }
      });

      assert(logoutResult.status === 201, `expected 201, got ${logoutResult.status}`);
      assert(logoutResult.json?.ok === true, 'expected ok=true');

      const meResult = await request('/api/v1/auth/me', {
        headers: {
          Authorization: `Bearer ${customerToken}`
        }
      });

      assert(meResult.status === 401, `expected 401 after logout, got ${meResult.status}`);
      assert(meResult.json?.code === 'SESSION_UNAUTHORIZED', 'expected SESSION_UNAUTHORIZED');
      return {
        logout: logoutResult.json,
        meAfterLogout: meResult.json
      };
    });

    console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, cases }, null, 2));
  } finally {
    await prisma.authSession.deleteMany({
      where: {
        tokenHash: {
          in: tokenHashes
        }
      }
    });
    await prisma.user.deleteMany({
      where: {
        openId: {
          in: [customerOpenId, `auth-blocked-customer-${runId}`]
        }
      }
    });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, baseUrl: BASE_URL, error: `${error?.message || error}` }, null, 2));
  process.exit(1);
});
