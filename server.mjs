import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, timingSafeEqual, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const sessions = new Map();
const liveAccessSessions = new Map();
const loginAttempts = new Map();
const SESSION_TTL = 12 * 60 * 60 * 1000;
const MAX_BODY = 1024 * 1024;

const defaults = () => ({
  settings: {
    siteName: 'JKT48HUB',
    tagline: 'Cukup satu klik, semua dalam genggamanmu.',
    heroTitle: 'Semua momen JKT48, dalam satu hub.',
    heroText: 'Temukan update live, jadwal theater, replay, dan kabar terbaru seputar JKT48 di satu tempat.',
    announcement: 'Website fan-made independen. Jadwal dan siaran dapat berubah sewaktu-waktu.',
    announcementEnabled: true,
    footerText: 'Dibuat oleh fans, untuk fans. Tidak berafiliasi dengan JKT48 atau pihak manajemen resmi.',
    contactUrl: '',
    instagramUrl: ''
  },
  shows: [],
  news: [],
  accessEmails: [],
  admin: null
});

let db;
async function loadDB() {
  await mkdir(DATA_DIR, { recursive: true });
  let raw;
  try {
    raw = await readFile(DB_FILE, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw new Error(`Database tidak dapat dibaca (${DB_FILE}). Periksa izin akses dan pulihkan dari backup jika diperlukan.`, { cause: e });
    db = defaults();
    await saveDB();
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Database ${DB_FILE} berisi JSON yang tidak valid. Server dihentikan agar data tidak tertimpa; pulihkan file dari backup.`, { cause: e });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Database ${DB_FILE} memiliki format yang tidak valid. Server dihentikan agar data tidak tertimpa.`);
  }
  db = { ...defaults(), ...parsed, settings: { ...defaults().settings, ...(parsed.settings || {}) }, shows: Array.isArray(parsed.shows) ? parsed.shows : [], news: Array.isArray(parsed.news) ? parsed.news : [], accessEmails: Array.isArray(parsed.accessEmails) ? parsed.accessEmails : [] };
}
let saveChain = Promise.resolve();
function saveDB() {
  saveChain = saveChain.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    const temp = `${DB_FILE}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(db, null, 2), { mode: 0o600 });
    const { rename } = await import('node:fs/promises');
    await rename(temp, DB_FILE);
  });
  return saveChain;
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};
function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': typeof data === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...headers
  });
  res.end(body);
}
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; media-src 'self' https: blob:; connect-src 'self' https:; frame-src https://www.youtube.com https://www.youtube-nocookie.com https://m.youtube.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
}
function cookieMap(req) {
  const result = {};
  for (const bit of (req.headers.cookie || '').split(';')) {
    const idx = bit.indexOf('=');
    if (idx > 0) result[bit.slice(0, idx).trim()] = decodeURIComponent(bit.slice(idx + 1).trim());
  }
  return result;
}
function getSession(req) {
  const token = cookieMap(req).jhub_session;
  if (!token) return null;
  const record = sessions.get(token);
  if (!record || record.expires < Date.now()) { sessions.delete(token); return null; }
  record.expires = Date.now() + SESSION_TTL;
  return { token, ...record };
}
function getLiveAccess(req) {
  const token = cookieMap(req).jhub_live;
  const record = token && liveAccessSessions.get(token);
  if (!record || record.expires <= Date.now()) { if (token) liveAccessSessions.delete(token); return null; }
  return { token, ...record };
}
function requireAdmin(req, res) {
  const s = getSession(req);
  if (!s) { send(res, 401, { error: 'Sesi admin berakhir. Silakan login kembali.' }); return null; }
  return s;
}
async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY) throw new Error('Ukuran data terlalu besar.');
  }
  if (!body) return {};
  try { return JSON.parse(body); } catch { throw new Error('Format JSON tidak valid.'); }
}
function textVal(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}
function safeUrl(value, allowBlank = true) {
  const raw = textVal(value, 1500);
  if (!raw && allowBlank) return '';
  try {
    const u = new URL(raw);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : null;
  } catch { return null; }
}
function normaliseEmail(value) {
  const email = textVal(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
function accessExpiry(duration) {
  const ms = { '1d': 24 * 60 * 60 * 1000, '1m': 30 * 24 * 60 * 60 * 1000, '1y': 365 * 24 * 60 * 60 * 1000 }[duration];
  return ms ? new Date(Date.now() + ms).toISOString() : null;
}
function normaliseShow(payload, existing = {}) {
  const title = textVal(payload.title, 130);
  if (!title) throw new Error('Judul show wajib diisi.');
  const type = ['live', 'upcoming', 'replay'].includes(payload.type) ? payload.type : 'upcoming';
  const thumb = safeUrl(payload.thumbnail || '', true);
  const stream = safeUrl(payload.streamUrl || '', true);
  const idnSessionUrl = safeUrl(payload.idnSessionUrl || '', true);
  if (thumb === null || stream === null || idnSessionUrl === null) throw new Error('URL gambar, stream, dan sesi IDN harus berupa tautan HTTP/HTTPS yang valid.');
  let dateTime = textVal(payload.dateTime, 40);
  if (dateTime && Number.isNaN(Date.parse(dateTime))) throw new Error('Tanggal/jam tidak valid.');
  return {
    id: existing.id || randomUUID(), title, summary: textVal(payload.summary, 600), type,
    dateTime, thumbnail: thumb, streamUrl: stream, idnSessionUrl, idnShowSlug: textVal(payload.idnShowSlug, 130), members: textVal(payload.members, 220),
    category: textVal(payload.category || 'Theater', 50), featured: !!payload.featured,
    published: payload.published !== false, createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
function normaliseNews(payload, existing = {}) {
  const title = textVal(payload.title, 130);
  if (!title) throw new Error('Judul berita wajib diisi.');
  const link = safeUrl(payload.link || '', true);
  const thumb = safeUrl(payload.thumbnail || '', true);
  if (link === null || thumb === null) throw new Error('URL berita dan gambar harus berupa tautan HTTP/HTTPS yang valid.');
  const date = textVal(payload.date, 40);
  if (date && Number.isNaN(Date.parse(date))) throw new Error('Tanggal berita tidak valid.');
  return { id: existing.id || randomUUID(), title, summary: textVal(payload.summary, 700), category: textVal(payload.category || 'Update', 50), date: date || new Date().toISOString(), link, thumbnail: thumb, published: payload.published !== false, createdAt: existing.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
}
async function verifyPassword(password, salt, expected) {
  const got = await scrypt(String(password), Buffer.from(salt, 'hex'), 64);
  const want = Buffer.from(expected, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}
async function makePassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, Buffer.from(salt, 'hex'), 64);
  return { salt, hash: hash.toString('hex') };
}
function getIP(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim(); }
function allowLogin(ip) {
  const row = loginAttempts.get(ip);
  if (!row || row.until < Date.now()) return true;
  return row.count < 8;
}
function recordFailedLogin(ip) {
  const row = loginAttempts.get(ip);
  if (!row || row.until < Date.now()) loginAttempts.set(ip, { count: 1, until: Date.now() + 10 * 60 * 1000 });
  else row.count++;
}
function clearLogin(ip) { loginAttempts.delete(ip); }
function publicSettings() {
  const { siteName, tagline, heroTitle, heroText, announcement, announcementEnabled, footerText, contactUrl, instagramUrl } = db.settings;
  return { siteName, tagline, heroTitle, heroText, announcement, announcementEnabled, footerText, contactUrl, instagramUrl };
}
function json(res, status, data, headers = {}) { return send(res, status, data, headers); }

async function route(req, res) {
  setSecurityHeaders(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);
  if (req.method === 'GET' && pathname === '/api/boot') {
    return json(res, 200, { adminConfigured: !!db.admin, settings: publicSettings(), counts: { shows: db.shows.filter(x => x.published).length, news: db.news.filter(x => x.published).length } });
  }
  if (req.method === 'GET' && pathname === '/api/content') {
    const shows = db.shows.filter(x => x.published).sort((a,b) => (Date.parse(b.updatedAt || b.createdAt) || 0) - (Date.parse(a.updatedAt || a.createdAt) || 0)).map(({ streamUrl, idnSessionUrl, idnShowSlug, ...show }) => ({ ...show, stageAvailable: !!(streamUrl || idnShowSlug) }));
    return json(res, 200, { settings: publicSettings(), shows, news: db.news.filter(x => x.published).sort((a,b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0)) });
  }
  if (req.method === 'POST' && pathname === '/api/live-stage/access') {
    let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }); }
    const email = normaliseEmail(body.email);
    const pass = email && db.accessEmails.find(x => x.email === email && Date.parse(x.expiresAt) > Date.now());
    if (!pass) return json(res, 403, { error: 'Email tidak terdaftar atau masa aksesnya sudah berakhir.' });
    const token = randomBytes(32).toString('hex'); const expires = Date.parse(pass.expiresAt);
    liveAccessSessions.set(token, { email, expires });
    const maxAge = Math.max(1, Math.floor((expires - Date.now()) / 1000));
    return json(res, 200, { ok: true, expiresAt: pass.expiresAt }, { 'Set-Cookie': `jhub_live=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${isProduction ? '; Secure' : ''}` });
  }
  if (req.method === 'GET' && pathname === '/api/live-stage/show') {
    if (!getLiveAccess(req)) return json(res, 401, { error: 'Masukkan email terdaftar untuk membuka Live Stage.' });
    const requested = textVal(url.searchParams.get('show'), 80);
    const visible = db.shows.filter(x => x.published && (x.streamUrl || x.idnShowSlug));
    const show = requested ? visible.find(x => x.id === requested) : visible.find(x => x.type === 'live') || visible[0];
    if (!show) return json(res, 404, { error: 'Live stage belum tersedia.' });
    return json(res, 200, { show });
  }
  if (req.method === 'GET' && pathname === '/api/admin/session') {
    const s = getSession(req);
    return json(res, 200, { authenticated: !!s, username: s?.username || '', adminConfigured: !!db.admin });
  }
  if (req.method === 'POST' && pathname === '/api/admin/setup') {
    if (db.admin) return json(res, 409, { error: 'Admin sudah dibuat. Silakan login.' });
    let body;
    try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }); }
    const username = textVal(body.username, 32);
    const password = String(body.password || '');
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) return json(res, 400, { error: 'Username 3–32 karakter: gunakan huruf, angka, titik, garis bawah, atau minus.' });
    if (password.length < 12 || password.length > 200) return json(res, 400, { error: 'Password awal minimal 12 karakter.' });
    const creds = await makePassword(password);
    db.admin = { username, ...creds, createdAt: new Date().toISOString() };
    await saveDB();
    const token = randomBytes(32).toString('hex');
    sessions.set(token, { username, expires: Date.now() + SESSION_TTL });
    return json(res, 201, { ok: true, username }, { 'Set-Cookie': `jhub_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}${isProduction ? '; Secure' : ''}` });
  }
  if (req.method === 'POST' && pathname === '/api/admin/login') {
    const ip = getIP(req);
    if (!allowLogin(ip)) return json(res, 429, { error: 'Terlalu banyak percobaan login. Coba lagi dalam 10 menit.' });
    let body;
    try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }); }
    if (!db.admin) return json(res, 409, { error: 'Admin belum dibuat. Gunakan halaman setup terlebih dahulu.' });
    const username = textVal(body.username, 32);
    const goodUser = username === db.admin.username;
    let goodPass = false;
    try { goodPass = await verifyPassword(body.password || '', db.admin.salt, db.admin.hash); } catch {}
    if (!goodUser || !goodPass) { recordFailedLogin(ip); return json(res, 401, { error: 'Username atau password salah.' }); }
    clearLogin(ip);
    const token = randomBytes(32).toString('hex');
    sessions.set(token, { username, expires: Date.now() + SESSION_TTL });
    return json(res, 200, { ok: true, username }, { 'Set-Cookie': `jhub_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}${isProduction ? '; Secure' : ''}` });
  }
  if (req.method === 'POST' && pathname === '/api/admin/logout') {
    const s = getSession(req);
    if (s) sessions.delete(s.token);
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'jhub_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }
  if (pathname.startsWith('/api/admin/')) {
    const session = requireAdmin(req, res);
    if (!session) return;
    if (req.method === 'GET' && pathname === '/api/admin/data') {
      return json(res, 200, { settings: db.settings, shows: db.shows, news: db.news, accessEmails: db.accessEmails, username: session.username });
    }
    if (req.method === 'POST' && pathname === '/api/admin/shows') {
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }); }
      try {
        const existing = body.id ? db.shows.find(x => x.id === body.id) : null;
        if (body.id && !existing) return json(res, 404, { error: 'Show tidak ditemukan.' });
        const item = normaliseShow(body, existing || {});
        if (existing) db.shows = db.shows.map(x => x.id === existing.id ? item : x); else db.shows.unshift(item);
        await saveDB(); return json(res, 200, { ok: true, item });
      } catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (req.method === 'DELETE' && pathname.startsWith('/api/admin/shows/')) {
      const id = pathname.split('/').at(-1); const before = db.shows.length;
      db.shows = db.shows.filter(x => x.id !== id);
      if (db.shows.length === before) return json(res, 404, { error: 'Show tidak ditemukan.' });
      await saveDB(); return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/admin/news') {
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }); }
      try {
        const existing = body.id ? db.news.find(x => x.id === body.id) : null;
        if (body.id && !existing) return json(res, 404, { error: 'Berita tidak ditemukan.' });
        const item = normaliseNews(body, existing || {});
        if (existing) db.news = db.news.map(x => x.id === existing.id ? item : x); else db.news.unshift(item);
        await saveDB(); return json(res, 200, { ok: true, item });
      } catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (req.method === 'DELETE' && pathname.startsWith('/api/admin/news/')) {
      const id = pathname.split('/').at(-1); const before = db.news.length;
      db.news = db.news.filter(x => x.id !== id);
      if (db.news.length === before) return json(res, 404, { error: 'Berita tidak ditemukan.' });
      await saveDB(); return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/admin/settings') {
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }); }
      const textFields = ['siteName','tagline','heroTitle','heroText','announcement','footerText'];
      for (const key of textFields) if (key in body) db.settings[key] = textVal(body[key], key === 'heroText' || key === 'footerText' || key === 'announcement' ? 700 : 180);
      if ('announcementEnabled' in body) db.settings.announcementEnabled = !!body.announcementEnabled;
      for (const key of ['contactUrl','instagramUrl']) {
        if (key in body) { const val = safeUrl(body[key] || '', true); if (val === null) return json(res, 400, { error: `Tautan ${key} tidak valid.` }); db.settings[key] = val; }
      }
      await saveDB(); return json(res, 200, { ok: true, settings: db.settings });
    }
    if (req.method === 'POST' && pathname === '/api/admin/access-emails') {
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }); }
      const email = normaliseEmail(body.email); const expiresAt = accessExpiry(body.duration);
      if (!email || !expiresAt) return json(res, 400, { error: 'Email atau durasi akses tidak valid.' });
      const item = { id: randomUUID(), email, duration: body.duration, createdAt: new Date().toISOString(), expiresAt };
      db.accessEmails = [item, ...db.accessEmails.filter(x => x.email !== email)];
      await saveDB(); return json(res, 200, { ok: true, item, accessEmails: db.accessEmails });
    }
    if (req.method === 'DELETE' && pathname.startsWith('/api/admin/access-emails/')) {
      const id = pathname.split('/').at(-1); const before = db.accessEmails.length;
      db.accessEmails = db.accessEmails.filter(x => x.id !== id);
      if (db.accessEmails.length === before) return json(res, 404, { error: 'Email akses tidak ditemukan.' });
      await saveDB(); return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/admin/password') {
      let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }); }
      const password = String(body.newPassword || '');
      if (!await verifyPassword(body.currentPassword || '', db.admin.salt, db.admin.hash)) return json(res, 401, { error: 'Password saat ini tidak sesuai.' });
      if (password.length < 12 || password.length > 200) return json(res, 400, { error: 'Password baru minimal 12 karakter.' });
      const creds = await makePassword(password);
      db.admin = { ...db.admin, ...creds, updatedAt: new Date().toISOString() };
      await saveDB(); return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'Endpoint admin tidak ditemukan.' });
  }

  let filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : pathname === '/admin' || pathname === '/admin/' ? path.join(PUBLIC_DIR, 'admin.html') : pathname === '/live-stage' || pathname === '/live-stage/' ? path.join(PUBLIC_DIR, 'live-stage.html') : path.join(PUBLIC_DIR, pathname.replace(/^\/+/, ''));
  filePath = path.normalize(filePath);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && ![path.join(PUBLIC_DIR, 'index.html'), path.join(PUBLIC_DIR, 'admin.html'), path.join(PUBLIC_DIR, 'live-stage.html')].includes(filePath)) return send(res, 403, 'Forbidden');
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': path.extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=300' });
    res.end(data);
  } catch {
    send(res, 404, 'Halaman tidak ditemukan.');
  }
}

await loadDB();
const server = http.createServer((req, res) => {
  route(req, res).catch((err) => {
    console.error('Request error:', err);
    if (!res.headersSent) send(res, 500, { error: 'Terjadi kesalahan pada server.' });
    else res.end();
  });
});
server.listen(PORT, '0.0.0.0', () => console.log(`JKT48HUB berjalan di http://localhost:${PORT}`));
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
