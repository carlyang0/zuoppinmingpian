const http = require('node:http');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const QRCode = require('qrcode');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'h5');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const dbPath = path.join(dataDir, 'cards.json');
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';
const maxBodyBytes = 96 * 1024;
const baseUrl = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/+$/, '') : '';
const mutationWindowMs = 60 * 1000;
const maxMutationsPerWindow = 20;
const mutationBuckets = new Map();

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
};

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

async function ensureDb() {
  await fs.mkdir(dataDir, { recursive: true });
  if (!fsSync.existsSync(dbPath)) {
    await fs.writeFile(dbPath, JSON.stringify({ cards: {} }, null, 2));
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(dbPath, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.cards || typeof parsed.cards !== 'object') return { cards: {} };
    return parsed;
  } catch (error) {
    return { cards: {} };
  }
}

async function writeDb(db) {
  await ensureDb();
  const tempPath = `${dbPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(db, null, 2));
  await fs.rename(tempPath, dbPath);
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...securityHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, {
    ...securityHeaders,
    Location: location,
    'Cache-Control': 'no-store'
  });
  res.end();
}

function makeId() {
  return crypto.randomBytes(5).toString('base64url');
}

function makeToken() {
  return crypto.randomBytes(18).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function publicCard(record, req) {
  return {
    id: record.id,
    card: record.card,
    url: `${originOf(req)}/c/${record.id}`,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    views: record.views || 0
  };
}

function originOf(req) {
  if (baseUrl) return baseUrl;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const hostName = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${port}`;
  return `${proto}://${hostName}`;
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

function checkMutationRate(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const current = mutationBuckets.get(ip) || { count: 0, resetAt: now + mutationWindowMs };
  if (now > current.resetAt) {
    current.count = 0;
    current.resetAt = now + mutationWindowMs;
  }
  current.count += 1;
  mutationBuckets.set(ip, current);
  return current.count <= maxMutationsPerWindow;
}

function writeText(res, status, body, contentType = 'text/plain; charset=utf-8', cacheControl = 'no-store') {
  res.writeHead(status, {
    ...securityHeaders,
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sanitizeText(value, max = 1200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeMultiline(value, max = 3000) {
  return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function sanitizeUrl(value) {
  const raw = String(value || '').trim().slice(0, 600);
  if (!raw) return '';
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return '';
    return parsed.href;
  } catch (error) {
    return '';
  }
}

function sanitizeCard(input) {
  const card = input && typeof input === 'object' ? input : {};
  const works = Array.isArray(card.works) ? card.works.slice(0, 20) : [];
  return {
    name: sanitizeText(card.name, 80),
    identity: sanitizeText(card.identity, 80) || 'AI 产品经理',
    purpose: ['job', 'freelance', 'collab', 'brand'].includes(card.purpose) ? card.purpose : 'job',
    bio: sanitizeMultiline(card.bio, 800),
    contact: sanitizeText(card.contact, 180),
    works: works.map(work => ({
      title: sanitizeText(work.title, 120),
      type: ['product', 'article', 'video', 'event', 'case', 'other'].includes(work.type) ? work.type : 'other',
      url: sanitizeUrl(work.url),
      desc: sanitizeMultiline(work.desc, 1200),
      background: sanitizeMultiline(work.background, 1200),
      role: sanitizeMultiline(work.role, 1200),
      result: sanitizeMultiline(work.result, 1200),
      proof: sanitizeMultiline(work.proof, 1200)
    })).filter(work => work.title || work.url || work.desc || work.background || work.role || work.result || work.proof)
  };
}

async function readBody(req) {
  return await new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error('内容过大，请减少作品数量或文字长度'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error('JSON 格式不正确'));
      }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health') {
    json(res, 200, { ok: true });
    return true;
  }

  if (url.pathname === '/api/qr.svg' && req.method === 'GET') {
    const data = String(url.searchParams.get('data') || '').trim();
    if (!data || data.length > 2400) {
      json(res, 400, { error: '二维码内容为空或过长' });
      return true;
    }
    const svg = await QRCode.toString(data, {
      type: 'svg',
      width: 240,
      margin: 2,
      errorCorrectionLevel: 'M'
    });
    writeText(res, 200, svg, 'image/svg+xml; charset=utf-8', 'public, max-age=300');
    return true;
  }

  if (url.pathname === '/api/cards' && req.method === 'POST') {
    if (!checkMutationRate(req)) {
      json(res, 429, { error: '发布太频繁，请稍后再试' });
      return true;
    }
    try {
      const body = await readBody(req);
      const card = sanitizeCard(body.card);
      if (!card.works.length) {
        json(res, 400, { error: '请至少添加 1 个作品' });
        return true;
      }
      const db = await readDb();
      let id = makeId();
      while (db.cards[id]) id = makeId();
      const editToken = makeToken();
      const now = new Date().toISOString();
      db.cards[id] = {
        id,
        card,
        editTokenHash: hashToken(editToken),
        createdAt: now,
        updatedAt: now,
        views: 0
      };
      await writeDb(db);
      json(res, 201, { ...publicCard(db.cards[id], req), editToken });
    } catch (error) {
      json(res, 400, { error: error.message || '发布失败' });
    }
    return true;
  }

  const cardMatch = url.pathname.match(/^\/api\/cards\/([a-zA-Z0-9_-]+)$/);
  if (cardMatch && req.method === 'GET') {
    const id = cardMatch[1];
    const db = await readDb();
    const record = db.cards[id];
    if (!record) {
      json(res, 404, { error: '名片不存在' });
      return true;
    }
    record.views = (record.views || 0) + 1;
    await writeDb(db);
    json(res, 200, publicCard(record, req));
    return true;
  }

  if (cardMatch && req.method === 'PUT') {
    if (!checkMutationRate(req)) {
      json(res, 429, { error: '更新太频繁，请稍后再试' });
      return true;
    }
    try {
      const id = cardMatch[1];
      const body = await readBody(req);
      const db = await readDb();
      const record = db.cards[id];
      if (!record) {
        json(res, 404, { error: '名片不存在' });
        return true;
      }
      if (record.editTokenHash !== hashToken(body.editToken)) {
        json(res, 403, { error: '没有编辑权限' });
        return true;
      }
      const card = sanitizeCard(body.card);
      if (!card.works.length) {
        json(res, 400, { error: '请至少添加 1 个作品' });
        return true;
      }
      record.card = card;
      record.updatedAt = new Date().toISOString();
      await writeDb(db);
      json(res, 200, publicCard(record, req));
    } catch (error) {
      json(res, 400, { error: error.message || '更新失败' });
    }
    return true;
  }

  return false;
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/h5/index.html';
  const cardMatch = pathname.match(/^\/c\/([a-zA-Z0-9_-]+)$/);
  if (cardMatch) {
    redirect(res, `/h5/index.html?id=${encodeURIComponent(cardMatch[1])}`);
    return;
  }
  if (pathname === '/h5') {
    redirect(res, '/h5/index.html');
    return;
  }
  if (!pathname.startsWith('/h5/')) {
    writeText(res, 404, 'Not found');
    return;
  }

  const relativePath = pathname.slice('/h5/'.length) || 'index.html';
  const filePath = path.resolve(publicDir, relativePath);
  if (!filePath.startsWith(`${publicDir}${path.sep}`) && filePath !== publicDir) {
    writeText(res, 403, 'Forbidden');
    return;
  }

  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      redirect(res, path.posix.join(pathname, 'index.html'));
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      ...securityHeaders,
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600'
    });
    fsSync.createReadStream(filePath).pipe(res);
  } catch (error) {
    writeText(res, 404, 'Not found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `localhost:${port}`}`);
    if (await handleApi(req, res, url)) return;
    await serveStatic(req, res, url);
  } catch (error) {
    json(res, 500, { error: '服务器错误' });
  }
});

server.listen(port, host, () => {
  console.log(`作品名片服务已启动：http://localhost:${port}`);
});
