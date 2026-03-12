import http from 'node:http';
import { URL } from 'node:url';

const port = Number(process.env.PORT || 3000);

const services = [
  {
    id: 'svc-classic',
    name: '经典纯色美甲',
    durationMinutes: 60,
    price: 168,
    description: '适合日常通勤的基础款'
  },
  {
    id: 'svc-design',
    name: '轻奢款式设计',
    durationMinutes: 90,
    price: 268,
    description: '适合拍照和节日场景'
  }
];

const appointments = [
  {
    id: 'apt-001',
    customerName: 'Lan',
    phone: '13800000000',
    serviceId: 'svc-classic',
    serviceName: '经典纯色美甲',
    date: '2026-03-12',
    timeSlot: '14:00-15:00',
    note: '希望偏自然风',
    status: 'pending',
    createdAt: new Date('2026-03-11T09:00:00.000Z').toISOString()
  }
];

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'miniapp-server',
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/v1/services') {
    sendJson(res, 200, { items: services });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/v1/appointments') {
    sendJson(res, 200, { items: appointments });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/v1/appointments') {
    try {
      const body = await readJson(req);
      const required = ['customerName', 'phone', 'serviceId', 'serviceName', 'date', 'timeSlot'];
      const missing = required.filter((field) => !body[field]);

      if (missing.length > 0) {
        sendJson(res, 400, {
          error: 'Missing required fields',
          missing
        });
        return;
      }

      const item = {
        id: `apt-${String(appointments.length + 1).padStart(3, '0')}`,
        customerName: body.customerName,
        phone: body.phone,
        serviceId: body.serviceId,
        serviceName: body.serviceName,
        date: body.date,
        timeSlot: body.timeSlot,
        note: body.note || '',
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      appointments.unshift(item);
      sendJson(res, 201, { item });
      return;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Bad request' });
      return;
    }
  }

  sendJson(res, 404, {
    error: 'Not found',
    path: url.pathname
  });
}

async function runSelfTest() {
  const fakeRes = {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(payload) {
      this.body = payload;
    }
  };

  await handleRequest({ method: 'GET', url: '/health', headers: {}, on() {} }, fakeRes);
  const parsed = JSON.parse(fakeRes.body);
  if (!parsed.ok) {
    throw new Error('Self test failed: /health did not return ok=true');
  }
  console.log('self-test ok');
}

if (process.argv.includes('--self-test')) {
  runSelfTest().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
} else {
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      sendJson(res, 500, { error: error.message || 'Internal server error' });
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`miniapp-server listening on http://127.0.0.1:${port}`);
  });
}
