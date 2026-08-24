import { createHash } from 'node:crypto';
import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  PrismaClient,
  StaffMemberStatus,
  StaffRole,
  UserRole,
  UserStatus
} from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3100';
const STAFF_OPEN_ID = process.env.STAFF_OPEN_ID || 'staff-openid-demo';
const runId = `${Date.now()}`;
const VALID_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

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

function createImageForm(filename = 'reference.png', type = 'image/png', bytes = VALID_PNG_BYTES) {
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(bytes)], { type }), filename);
  return form;
}

function createMultipleImageForm(count) {
  const form = new FormData();
  for (let index = 0; index < count; index += 1) {
    form.append(
      'files',
      new Blob([new Uint8Array(VALID_PNG_BYTES)], { type: 'image/png' }),
      `reference-${index}.png`
    );
  }
  return form;
}

function createMixedValidityImageForm() {
  const form = new FormData();
  form.append(
    'files',
    new Blob([new Uint8Array(VALID_PNG_BYTES)], { type: 'image/png' }),
    'valid-reference.png'
  );
  form.append(
    'files',
    new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }),
    'spoofed-reference.png'
  );
  return form;
}

async function listUploadsWithPrefix(prefix) {
  const uploadDir = path.resolve(process.cwd(), 'uploads', 'gallery');
  const filenames = await readdir(uploadDir).catch((error) => {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  });
  return filenames.filter((filename) => filename.startsWith(prefix)).sort();
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
  const otherCustomerOpenId = `auth-other-customer-${runId}`;
  const customerToken = `auth-customer-token-${runId}`;
  const blockedCustomerToken = `auth-blocked-customer-token-${runId}`;
  const staffToken = `auth-staff-token-${runId}`;
  const tokenHashes = [customerToken, blockedCustomerToken, staffToken].map(sha256);
  const uploadedFilenames = [];
  const staffUserBefore = await prisma.user.findUnique({
    where: { openId: STAFF_OPEN_ID },
    select: { id: true, role: true, status: true }
  });
  const staffMembershipBefore = staffUserBefore
    ? await prisma.staffMember.findUnique({ where: { userId: staffUserBefore.id } })
    : null;
  let customerUploadedFilename = '';
  let otherCustomerUploadedFilename = '';
  let staffUploadedFilename = '';

  async function runCase(name, fn) {
    const detail = await fn();
    cases.push({ name, ok: true, detail });
  }

  try {
    await createSession(customerOpenId, UserRole.CUSTOMER, customerToken);
    await createSession(otherCustomerOpenId, UserRole.CUSTOMER, blockedCustomerToken);
    const { user: staffUser } = await createSession(STAFF_OPEN_ID, UserRole.STAFF, staffToken);
    await prisma.staffMember.upsert({
      where: { userId: staffUser.id },
      create: { userId: staffUser.id, role: StaffRole.OWNER, status: StaffMemberStatus.ACTIVE },
      update: { role: StaffRole.OWNER, status: StaffMemberStatus.ACTIVE, disabledAt: null, disabledByUserId: null }
    });

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

    await runCase('staff bearer retains customer appointment capability', async () => {
      const result = await request('/api/v1/my/appointments', {
        headers: {
          Authorization: `Bearer ${staffToken}`
        }
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(Array.isArray(result.json?.items), 'expected appointment items');
      return result.json;
    });

    await runCase('staff bearer retains customer inspiration capability', async () => {
      const result = await request('/api/v1/my/inspirations', {
        headers: {
          Authorization: `Bearer ${staffToken}`
        }
      });

      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(Array.isArray(result.json?.items), 'expected inspiration items');
      return result.json;
    });

    await runCase('customer upload rejects identity before multipart limits', async () => {
      const result = await request('/api/v1/uploads/images', {
        method: 'POST',
        body: createMultipleImageForm(7)
      });

      assert(result.status === 401, `expected 401, got ${result.status}`);
      assert(result.json?.code === 'CUSTOMER_UNAUTHORIZED', 'expected CUSTOMER_UNAUTHORIZED');
      return result.json;
    });

    await runCase('customer bearer cannot use staff image upload', async () => {
      const result = await request('/api/v1/staff/uploads/images', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${customerToken}`
        },
        body: createImageForm()
      });

      assert(result.status === 401, `expected 401, got ${result.status}`);
      assert(result.json?.code === 'STAFF_UNAUTHORIZED', 'expected STAFF_UNAUTHORIZED');
      return result.json;
    });

    await runCase('customer image upload rejects unsupported file type', async () => {
      const result = await request('/api/v1/uploads/images', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${customerToken}`
        },
        body: createImageForm('reference.txt', 'text/plain', [110, 111, 116, 45, 97, 110, 45, 105, 109, 97, 103, 101])
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'UNSUPPORTED_IMAGE_TYPE', 'expected UNSUPPORTED_IMAGE_TYPE');
      return result.json;
    });

    await runCase('customer image upload rejects spoofed image content', async () => {
      const result = await request('/api/v1/uploads/images', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${customerToken}`
        },
        body: createImageForm('spoofed.png', 'image/png', [137, 80, 78, 71])
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_IMAGE_FILE', 'expected INVALID_IMAGE_FILE');
      return result.json;
    });

    await runCase('customer image batch validation leaves no partial upload', async () => {
      const ownershipPrefix = `customer-${sha256(customerOpenId)}-`;
      const beforeFilenames = await listUploadsWithPrefix(ownershipPrefix);
      const result = await request('/api/v1/uploads/images', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${customerToken}`
        },
        body: createMixedValidityImageForm()
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_IMAGE_FILE', 'expected INVALID_IMAGE_FILE');
      const afterFilenames = await listUploadsWithPrefix(ownershipPrefix);
      assert(
        JSON.stringify(afterFilenames) === JSON.stringify(beforeFilenames),
        'invalid image batch must not leave partial uploads'
      );
      return result.json;
    });

    await runCase('customer image upload enforces six-file limit', async () => {
      const result = await request('/api/v1/uploads/images', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${customerToken}`
        },
        body: createMultipleImageForm(7)
      });

      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'UPLOAD_FILE_COUNT_EXCEEDED', 'expected UPLOAD_FILE_COUNT_EXCEEDED');
      return result.json;
    });

    await runCase('customer image upload enforces five-MiB file limit', async () => {
      const result = await request('/api/v1/uploads/images', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${customerToken}`
        },
        body: createImageForm(
          'too-large.png',
          'image/png',
          new Uint8Array(5 * 1024 * 1024 + 1)
        )
      });

      assert(result.status === 413, `expected 413, got ${result.status}`);
      assert(result.json?.code === 'UPLOAD_TOO_LARGE', 'expected UPLOAD_TOO_LARGE');
      return result.json;
    });

    await runCase('customer bearer uploads reference image', async () => {
      const result = await request('/api/v1/uploads/images', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${customerToken}`
        },
        body: createImageForm()
      });

      assert(result.status === 201, `expected 201, got ${result.status}`);
      assert(result.json?.items?.length === 1, 'expected one uploaded image');
      const uploadedUrl = `${result.json.items[0]?.url || ''}`;
      assert(uploadedUrl.includes('/api/v1/uploads/images/'), 'expected customer upload URL');
      const filename = path.basename(new URL(uploadedUrl).pathname);
      assert(filename, 'expected uploaded filename');
      assert(
        filename.startsWith(`customer-${sha256(customerOpenId)}-`),
        'expected irreversible customer ownership prefix'
      );
      customerUploadedFilename = filename;
      uploadedFilenames.push(filename);
      return result.json;
    });

    await runCase('customer uploaded image remains publicly readable', async () => {
      const result = await request(
        `/api/v1/uploads/images/${encodeURIComponent(customerUploadedFilename)}`
      );
      assert(result.status === 200, `expected 200, got ${result.status}`);
      return { filename: customerUploadedFilename, status: result.status };
    });

    await runCase('second customer upload has a distinct stable ownership prefix', async () => {
      const result = await request('/api/v1/uploads/images', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${blockedCustomerToken}`
        },
        body: createImageForm('other-reference.png')
      });

      assert(result.status === 201, `expected 201, got ${result.status}`);
      const uploadedUrl = `${result.json?.items?.[0]?.url || ''}`;
      const filename = uploadedUrl ? path.basename(new URL(uploadedUrl).pathname) : '';
      assert(
        filename.startsWith(`customer-${sha256(otherCustomerOpenId)}-`),
        'expected second customer ownership prefix'
      );
      assert(
        !filename.startsWith(`customer-${sha256(customerOpenId)}-`),
        'customer ownership prefixes must differ'
      );
      otherCustomerUploadedFilename = filename;
      uploadedFilenames.push(filename);
      return result.json;
    });

    await runCase('staff upload stays outside customer ownership namespace', async () => {
      const result = await request('/api/v1/staff/uploads/images', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${staffToken}`
        },
        body: createImageForm('staff-gallery.png')
      });

      assert(result.status === 201, `expected 201, got ${result.status}`);
      const uploadedUrl = `${result.json?.items?.[0]?.url || ''}`;
      const filename = uploadedUrl ? path.basename(new URL(uploadedUrl).pathname) : '';
      assert(filename, 'expected staff upload filename');
      assert(!filename.startsWith('customer-'), 'staff upload must not use customer namespace');
      staffUploadedFilename = filename;
      uploadedFilenames.push(filename);
      return result.json;
    });

    await runCase('customer image delete requires authentication', async () => {
      const result = await request(
        `/api/v1/uploads/images/${encodeURIComponent(customerUploadedFilename)}`,
        { method: 'DELETE' }
      );
      assert(result.status === 401, `expected 401, got ${result.status}`);
      assert(result.json?.code === 'CUSTOMER_UNAUTHORIZED', 'expected CUSTOMER_UNAUTHORIZED');
      return result.json;
    });

    await runCase('customer image delete rejects traversal filename', async () => {
      const traversalFilename = `..\\${customerUploadedFilename}`;
      const result = await request(
        `/api/v1/uploads/images/${encodeURIComponent(traversalFilename)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${customerToken}`
          }
        }
      );
      assert(result.status === 400, `expected 400, got ${result.status}`);
      assert(result.json?.code === 'INVALID_UPLOAD_FILENAME', 'expected INVALID_UPLOAD_FILENAME');
      return result.json;
    });

    await runCase('customer cannot delete another customer upload', async () => {
      const result = await request(
        `/api/v1/uploads/images/${encodeURIComponent(otherCustomerUploadedFilename)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${customerToken}`
          }
        }
      );
      assert(result.status === 403, `expected 403, got ${result.status}`);
      assert(
        result.json?.code === 'CUSTOMER_UPLOAD_FORBIDDEN',
        'expected CUSTOMER_UPLOAD_FORBIDDEN'
      );

      const readResult = await request(
        `/api/v1/uploads/images/${encodeURIComponent(otherCustomerUploadedFilename)}`
      );
      assert(readResult.status === 200, 'forbidden delete must preserve other customer file');
      return result.json;
    });

    await runCase('customer cannot delete staff or gallery upload', async () => {
      const result = await request(
        `/api/v1/uploads/images/${encodeURIComponent(staffUploadedFilename)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${customerToken}`
          }
        }
      );
      assert(result.status === 403, `expected 403, got ${result.status}`);
      assert(
        result.json?.code === 'CUSTOMER_UPLOAD_FORBIDDEN',
        'expected CUSTOMER_UPLOAD_FORBIDDEN'
      );

      const readResult = await request(
        `/api/v1/staff/uploads/images/${encodeURIComponent(staffUploadedFilename)}`
      );
      assert(readResult.status === 200, 'forbidden delete must preserve staff file');
      return result.json;
    });

    await runCase('customer image delete reports owned filename not found', async () => {
      const missingFilename = `customer-${sha256(customerOpenId)}-${Date.now()}-${'0'.repeat(24)}.png`;
      const result = await request(
        `/api/v1/uploads/images/${encodeURIComponent(missingFilename)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${customerToken}`
          }
        }
      );
      assert(result.status === 404, `expected 404, got ${result.status}`);
      assert(
        result.json?.code === 'CUSTOMER_UPLOAD_NOT_FOUND',
        'expected CUSTOMER_UPLOAD_NOT_FOUND'
      );
      return result.json;
    });

    await runCase('customer deletes own uploaded image', async () => {
      const result = await request(
        `/api/v1/uploads/images/${encodeURIComponent(customerUploadedFilename)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${customerToken}`
          }
        }
      );
      assert(result.status === 200, `expected 200, got ${result.status}`);
      assert(result.json?.item?.filename === customerUploadedFilename, 'expected deleted filename');

      const readResult = await request(
        `/api/v1/uploads/images/${encodeURIComponent(customerUploadedFilename)}`
      );
      assert(readResult.status === 404, 'deleted customer upload must no longer be readable');
      return result.json;
    });

    await runCase('customer repeated delete reports not found', async () => {
      const result = await request(
        `/api/v1/uploads/images/${encodeURIComponent(customerUploadedFilename)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${customerToken}`
          }
        }
      );
      assert(result.status === 404, `expected 404, got ${result.status}`);
      assert(
        result.json?.code === 'CUSTOMER_UPLOAD_NOT_FOUND',
        'expected CUSTOMER_UPLOAD_NOT_FOUND'
      );
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

    await runCase('disabled staff user cannot use an unexpired bearer session', async () => {
      await prisma.user.update({
        where: { openId: STAFF_OPEN_ID },
        data: { status: UserStatus.DISABLED }
      });

      const result = await request('/api/v1/staff/booking-rules', {
        headers: {
          Authorization: `Bearer ${staffToken}`,
          // A stale develop fallback must not bypass the disabled session.
          'X-Staff-OpenId': STAFF_OPEN_ID
        }
      });

      assert(result.status === 401, `expected 401, got ${result.status}`);
      assert(result.json?.code === 'STAFF_UNAUTHORIZED', 'expected STAFF_UNAUTHORIZED');
      return result.json;
    });

    await runCase('disabled membership immediately revokes staff access', async () => {
      await prisma.user.update({
        where: { openId: STAFF_OPEN_ID },
        data: { status: UserStatus.ACTIVE, role: UserRole.CUSTOMER }
      });
      await prisma.staffMember.update({
        where: { userId: (await prisma.user.findUniqueOrThrow({ where: { openId: STAFF_OPEN_ID } })).id },
        data: { status: StaffMemberStatus.DISABLED, disabledAt: new Date() }
      });

      const result = await request('/api/v1/staff/booking-rules', {
        headers: {
          Authorization: `Bearer ${staffToken}`
        }
      });

      assert(result.status === 401, `expected 401, got ${result.status}`);
      assert(result.json?.code === 'STAFF_UNAUTHORIZED', 'expected STAFF_UNAUTHORIZED');
      return result.json;
    });

    console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, cases }, null, 2));
  } finally {
    await Promise.all(
      uploadedFilenames.map((filename) =>
        unlink(path.resolve(process.cwd(), 'uploads', 'gallery', filename)).catch(() => undefined)
      )
    );
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
          in: [customerOpenId, otherCustomerOpenId]
        }
      }
    });
    if (staffUserBefore) {
      await prisma.user.update({
        where: { id: staffUserBefore.id },
        data: {
          role: staffUserBefore.role,
          status: staffUserBefore.status
        }
      });
      if (staffMembershipBefore) {
        await prisma.staffMember.upsert({
          where: { userId: staffUserBefore.id },
          create: {
            id: staffMembershipBefore.id,
            userId: staffUserBefore.id,
            role: staffMembershipBefore.role,
            status: staffMembershipBefore.status,
            createdByUserId: staffMembershipBefore.createdByUserId,
            disabledByUserId: staffMembershipBefore.disabledByUserId,
            disabledAt: staffMembershipBefore.disabledAt,
            createdAt: staffMembershipBefore.createdAt
          },
          update: {
            role: staffMembershipBefore.role,
            status: staffMembershipBefore.status,
            createdByUserId: staffMembershipBefore.createdByUserId,
            disabledByUserId: staffMembershipBefore.disabledByUserId,
            disabledAt: staffMembershipBefore.disabledAt
          }
        });
      } else {
        await prisma.staffMember.deleteMany({ where: { userId: staffUserBefore.id } });
      }
    } else {
      await prisma.user.deleteMany({
        where: { openId: STAFF_OPEN_ID }
      });
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, baseUrl: BASE_URL, error: `${error?.message || error}` }, null, 2));
  process.exit(1);
});
