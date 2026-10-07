// Бекенд «Мясо з Техасу» — Express + SQLite.
//
// Архітектура навмисно проста: весь спільний бізнес-стан (локації, склади, товари, замовлення,
// штат, розклад, рейтинги тощо) зберігається як ОДИН JSON-блоб в одному рядку таблиці app_state —
// це те саме, що раніше лежало в localStorage браузера, тепер лежить тут і роздається всім
// пристроям. Клієнт (public/sklad.html) читає й пише цей блоб цілком через /api/state, з номером
// версії для optimistic concurrency (щоб два пристрої, що зберігають одночасно, не затирали
// зміни одне одного мовчки).
//
// Автентифікація — по пін-коду співробітника (як і раніше), але тепер перевіряється на сервері:
// POST /api/auth/login видає токен сесії, який клієнт далі шле в заголовку Authorization.

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'app.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

// Початковий стан — той самий, що раніше повертав loadState() у браузері, коли localStorage був
// порожній: одна локація, один власник з піном 0000. Решту масивів (warehouses, products, orders...)
// клієнт сам довизначить при першому завантаженні (runMigrations() у sklad.html) і одразу ж
// збереже назад — розширена схема в базі з'явиться сама, нічого тут вручну перелічувати не треба.
const DEFAULT_STATE = {
  locations: [{ id: 'loc1', name: 'Точка 1' }],
  staff: [{ id: 'own1', name: 'Власник', pin: '0000', role: 'owner', locationId: 'loc1' }],
  currentLocation: 'loc1',
  stockItems: [],
  recipeIngredients: [],
  history: [],
  sales: [],
  products: [],
  orders: []
};

const seedIfEmpty = db.prepare('SELECT COUNT(*) as c FROM app_state').get();
if (seedIfEmpty.c === 0) {
  db.prepare('INSERT INTO app_state (id, data, version, updated_at) VALUES (1, ?, 1, ?)').run(
    JSON.stringify(DEFAULT_STATE),
    Date.now()
  );
  console.log('Створено початковий стан у БД (власник, пін 0000 — обов'+"'"+'язково зміните після першого входу).');
}

const getStateStmt = db.prepare('SELECT data, version FROM app_state WHERE id = 1');
const updateStateStmt = db.prepare('UPDATE app_state SET data = ?, version = ?, updated_at = ? WHERE id = 1 AND version = ?');
const insertSessionStmt = db.prepare('INSERT INTO sessions (token, staff_id, created_at) VALUES (?, ?, ?)');
const findSessionStmt = db.prepare('SELECT staff_id FROM sessions WHERE token = ?');
const deleteSessionStmt = db.prepare('DELETE FROM sessions WHERE token = ?');

// ---- Дуже простий rate-limit на логін (по IP), щоб пін (усього 4-6 цифр) не перебирали в лоб через
// публічний https-домен. Не розрахований на розподілену атаку з багатьох IP — для внутрішнього
// інструменту на невелику команду цього достатньо; тримати стан у пам'яті процесу тут ок.
const loginAttempts = new Map(); // ip -> { count, windowStart }
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 20;
function checkRateLimit(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || now - rec.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  rec.count++;
  return rec.count <= LOGIN_MAX_ATTEMPTS;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of loginAttempts) {
    if (now - rec.windowStart > LOGIN_WINDOW_MS) loginAttempts.delete(ip);
  }
}, 10 * 60 * 1000).unref();

const app = express();
app.use(express.json({ limit: '8mb' }));

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'no_token' });
  const row = findSessionStmt.get(token);
  if (!row) return res.status(401).json({ error: 'invalid_token' });
  req.staffId = row.staff_id;
  req.token = token;
  next();
}

app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'too_many_attempts' });
  }
  const pin = String((req.body && req.body.pin) || '').trim();
  if (!pin) return res.status(400).json({ error: 'pin_required' });

  const row = getStateStmt.get();
  const data = JSON.parse(row.data);
  const staff = (data.staff || []).find(s => s.pin === pin);
  if (!staff) return res.status(401).json({ error: 'invalid_pin' });

  const token = crypto.randomBytes(24).toString('hex');
  insertSessionStmt.run(token, staff.id, Date.now());
  res.json({ token, staffId: staff.id });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  deleteSessionStmt.run(req.token);
  res.status(204).end();
});

app.get('/api/state', requireAuth, (req, res) => {
  const row = getStateStmt.get();
  res.json({ version: row.version, data: JSON.parse(row.data) });
});

app.put('/api/state', requireAuth, (req, res) => {
  const body = req.body || {};
  const clientVersion = Number(body.version);
  const newData = body.data;
  if (!newData || typeof newData !== 'object' || Array.isArray(newData)) {
    return res.status(400).json({ error: 'invalid_data' });
  }
  const current = getStateStmt.get();
  if (clientVersion !== current.version) {
    // Хтось інший встиг зберегти між тим, як клієнт завантажив дані і тепер надсилає свої —
    // повертаємо актуальну версію+дані, клієнт сам вирішує, що робити (sklad.html: перезаписує
    // локальний стан свіжим і повідомляє користувача).
    return res.status(409).json({ version: current.version, data: JSON.parse(current.data) });
  }
  const newVersion = current.version + 1;
  const now = Date.now();
  const json = JSON.stringify(newData);
  const info = updateStateStmt.run(json, newVersion, now, current.version);
  if (info.changes === 0) {
    // Гонка: хтось оновив рівно між нашим SELECT і UPDATE. better-sqlite3 синхронний і однопотоковий
    // у межах процесу Node, тож таке практично неможливо, але про всяк випадок — той самий 409.
    const fresh = getStateStmt.get();
    return res.status(409).json({ version: fresh.version, data: JSON.parse(fresh.data) });
  }
  res.json({ version: newVersion });
});

// =====================================================================================
// Інтеграція з Checkbox (https://api.checkbox.ua). Сервер сам входить під касиром Checkbox, раз на
// хвилину тягне нові чеки й складає їх у таблицю checkbox_receipts. Застосунок (будь-який
// залогінений клієнт) забирає їх через /api/checkbox/claim і фіксує продажі та списання в своєму
// стані. Логін/пароль зберігаються ТІЛЬКИ тут, у БД сервера, і клієнту ніколи не віддаються.
// =====================================================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS checkbox_config (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS checkbox_receipts (
    id TEXT PRIMARY KEY,
    created_ms INTEGER NOT NULL,
    data TEXT NOT NULL,
    claimed_at INTEGER,
    applied INTEGER NOT NULL DEFAULT 0
  );
`);
const cbGetStmt = db.prepare('SELECT value FROM checkbox_config WHERE key = ?');
const cbSetStmt = db.prepare('INSERT INTO checkbox_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
const cbDelStmt = db.prepare('DELETE FROM checkbox_config WHERE key = ?');
function cbGet(k, def) { const r = cbGetStmt.get(k); return r ? r.value : def; }
function cbSet(k, v) { if (v === null || v === undefined) cbDelStmt.run(k); else cbSetStmt.run(k, String(v)); }

function requireOwner(req, res, next) {
  const data = JSON.parse(getStateStmt.get().data);
  const staff = (data.staff || []).find(s => s.id === req.staffId);
  if (!staff || staff.role !== 'owner') return res.status(403).json({ error: 'owner_only' });
  next();
}

let cbToken = null;
let cbSyncing = false;
function cbBase() { return (cbGet('base_url', '') || 'https://api.checkbox.ua').replace(/\/+$/, ''); }
function cbHeaders(extra) {
  const h = { 'accept': 'application/json', 'X-Client-Name': 'sklad-myaso-texasu', 'X-Client-Version': '1.0' };
  const ak = cbGet('access_key', '');
  if (ak) h['X-Access-Key'] = ak;
  if (cbToken) h['Authorization'] = 'Bearer ' + cbToken;
  return Object.assign(h, extra || {});
}
async function cbFetchJson(pathAndQuery, opts, retried) {
  const res = await fetch(cbBase() + pathAndQuery, Object.assign({ headers: cbHeaders() }, opts || {}));
  if (res.status === 401 && !retried && !(opts && opts.noAuthRetry)) {
    await cbSignin();
    return cbFetchJson(pathAndQuery, opts, true);
  }
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { body = { raw: text.slice(0, 500) }; }
  if (!res.ok) {
    const msg = (body && (body.message || body.detail || body.error)) ;
    const err = new Error('Checkbox ' + res.status + ': ' + (typeof msg === 'string' ? msg : JSON.stringify(msg || body || '').slice(0, 300)));
    err.status = res.status;
    throw err;
  }
  return body;
}
async function cbSignin() {
  const login = cbGet('login', ''), password = cbGet('password', '');
  if (!login || !password) throw new Error('Не вказано логін/пароль Checkbox');
  cbToken = null;
  const body = await cbFetchJson('/api/v1/cashier/signin', {
    method: 'POST',
    headers: cbHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ login, password }),
    noAuthRetry: true
  }, true);
  const tok = body && (body.access_token || body.token);
  if (!tok) throw new Error('Checkbox не повернув токен входу');
  cbToken = tok;
  return tok;
}
async function cbEnsureToken() { if (!cbToken) await cbSignin(); }

// Приводимо чек Checkbox до простого вигляду. Суми в Checkbox — у копійках, кількість — в тисячних.
function cbToMs(v) { const t = Date.parse(v || ''); return isNaN(t) ? 0 : t; }
function cbNormalizeReceipt(r) {
  if (!r || !r.id) return null;
  const shift = r.shift || {};
  const reg = shift.cash_register || r.cash_register || {};
  const typeStr = String(r.type || r.receipt_type || '') + ' ' + String((r.transaction && r.transaction.type) || '');
  const totalKop = Number(r.total_sum !== undefined ? r.total_sum : r.sum) || 0;
  const isReturn = /RETURN/i.test(typeStr) || r.is_return === true || totalKop < 0;
  const rawGoods = Array.isArray(r.goods) ? r.goods : [];
  let goods = rawGoods.map(g => {
    const good = g.good || g;
    const qty = (Number(g.quantity) || 0) / 1000;
    const priceKop = Number(good.price) || 0;
    let lineKop = g.sum !== undefined ? Number(g.sum) : Math.round(priceKop * qty);
    if (!isFinite(lineKop)) lineKop = 0;
    const code = good.code !== undefined && good.code !== null ? String(good.code) : '';
    const name = String(good.name || g.name || '').trim();
    return { key: code ? 'c:' + code : 'n:' + name.toLowerCase(), code, name, qty: Math.abs(qty), lineKop: Math.abs(lineKop) };
  }).filter(g => g.qty > 0 && g.name);
  // Знижки на весь чек: масштабуємо суми рядків, щоб у сумі вони дорівнювали фактичному total_sum.
  const sumLines = goods.reduce((a, g) => a + g.lineKop, 0);
  const totalAbs = Math.abs(totalKop);
  const k = sumLines > 0 && totalAbs > 0 ? totalAbs / sumLines : 1;
  goods = goods.map(g => {
    const sum = Math.round(g.lineKop * k) / 100;
    return { key: g.key, code: g.code, name: g.name, qty: g.qty, sum, price: Number((sum / g.qty).toFixed(2)) };
  });
  return {
    id: String(r.id),
    ms: cbToMs(r.created_at || r.updated_at),
    status: String(r.status || ''),
    isReturn,
    total: totalAbs / 100,
    fiscalCode: r.fiscal_code || '',
    registerId: String(reg.id || r.cash_register_id || ''),
    registerName: String(reg.title || reg.fiscal_number || reg.name || ''),
    cashier: String((shift.cashier && (shift.cashier.full_name || shift.cashier.name)) || (r.cashier && (r.cashier.full_name || r.cashier.name)) || ''),
    goods
  };
}
async function cbFetchReceipts(fromMs, toMs) {
  await cbEnsureToken();
  const out = [];
  const limit = 100;
  for (let page = 0; page < 30; page++) {
    const q = '?from_date=' + encodeURIComponent(new Date(fromMs).toISOString()) +
      '&to_date=' + encodeURIComponent(new Date(toMs).toISOString()) +
      '&limit=' + limit + '&offset=' + (page * limit);
    const body = await cbFetchJson('/api/v1/receipts' + q);
    const list = Array.isArray(body) ? body : ((body && (body.results || body.items || body.data)) || []);
    out.push(...list);
    if (list.length < limit) break;
  }
  return out;
}
const cbInsertReceipt = db.prepare('INSERT OR IGNORE INTO checkbox_receipts (id, created_ms, data) VALUES (?, ?, ?)');

async function cbPoll() {
  if (cbSyncing) return;
  const startFrom = Number(cbGet('start_from_ms', '0')) || 0;
  if (!startFrom) return;               // синхронізація вимкнена
  if (!cbGet('login', '') || !cbGet('password', '')) return;
  cbSyncing = true;
  try {
    const now = Date.now();
    const last = Number(cbGet('last_sync_ms', '0')) || 0;
    // Перекриваємо вікно на 15 хв — на випадок затримки фіскалізації; дублі відсікає PRIMARY KEY.
    const from = Math.max(startFrom, (last || startFrom) - 15 * 60 * 1000);
    const raw = await cbFetchReceipts(from, now + 60 * 1000);
    let added = 0;
    for (const r of raw) {
      const n = cbNormalizeReceipt(r);
      if (!n || n.status.toUpperCase() !== 'DONE' || !n.goods.length || n.ms < startFrom) continue;
      const info = cbInsertReceipt.run(n.id, n.ms, JSON.stringify(n));
      if (info.changes) added++;
    }
    cbSet('last_sync_ms', now);
    cbSet('last_error', '');
    cbSet('last_sync_info', JSON.stringify({ at: now, fetched: raw.length, added }));
  } catch (e) {
    cbSet('last_error', String(e.message || e));
    console.error('Checkbox sync error:', e.message || e);
  } finally {
    cbSyncing = false;
  }
}
setInterval(() => { cbPoll(); }, 60 * 1000);
setTimeout(() => { cbPoll(); }, 5000);

app.get('/api/checkbox/status', requireAuth, (req, res) => {
  const startFrom = Number(cbGet('start_from_ms', '0')) || 0;
  const pending = startFrom
    ? db.prepare('SELECT COUNT(*) c FROM checkbox_receipts WHERE applied = 0').get().c : 0;
  res.json({ enabled: !!startFrom, startFrom, pending });
});
app.get('/api/checkbox/config', requireAuth, requireOwner, (req, res) => {
  res.json({
    login: cbGet('login', ''), hasPassword: !!cbGet('password', ''), accessKey: cbGet('access_key', ''),
    baseUrl: cbGet('base_url', '') || 'https://api.checkbox.ua',
    enabled: !!(Number(cbGet('start_from_ms', '0')) || 0), startFrom: Number(cbGet('start_from_ms', '0')) || 0,
    lastError: cbGet('last_error', ''), lastSync: cbGet('last_sync_info', ''),
    receiptsStored: db.prepare('SELECT COUNT(*) c FROM checkbox_receipts').get().c,
    pending: db.prepare('SELECT COUNT(*) c FROM checkbox_receipts WHERE applied = 0').get().c
  });
});
app.put('/api/checkbox/config', requireAuth, requireOwner, (req, res) => {
  const b = req.body || {};
  if (typeof b.login === 'string') cbSet('login', b.login.trim());
  if (typeof b.password === 'string' && b.password) cbSet('password', b.password);
  if (typeof b.accessKey === 'string') cbSet('access_key', b.accessKey.trim());
  if (typeof b.baseUrl === 'string') cbSet('base_url', b.baseUrl.trim());
  cbToken = null;
  res.json({ ok: true });
});
// Ручна перевірка: вхід + список кас + пробна вибірка чеків за добу (нічого не зберігає).
app.post('/api/checkbox/test', requireAuth, requireOwner, async (req, res) => {
  try {
    await cbSignin();
    let registers = [];
    try {
      const body = await cbFetchJson('/api/v1/cash-registers?limit=100');
      const list = Array.isArray(body) ? body : ((body && (body.results || body.items)) || []);
      registers = list.map(r => ({ id: String(r.id), title: String(r.title || r.fiscal_number || r.number || r.id), fiscal: String(r.fiscal_number || '') }));
    } catch (e) { registers = []; var regErr = String(e.message || e); }
    let sample = null, count = null, sampleErr = null;
    try {
      const now = Date.now();
      const raw = await cbFetchReceipts(now - 24 * 3600 * 1000, now + 60000);
      count = raw.length;
      sample = raw.length ? cbNormalizeReceipt(raw[0]) : null;
      // Каси, які реально бачимо в чеках, теж пропонуємо для зіставлення.
      raw.map(cbNormalizeReceipt).filter(Boolean).forEach(n => {
        if (n.registerId && !registers.find(x => x.id === n.registerId)) registers.push({ id: n.registerId, title: n.registerName || n.registerId, fiscal: '' });
      });
    } catch (e) { sampleErr = String(e.message || e); }
    res.json({ ok: true, registers, registersError: regErr || null, receiptsLast24h: count, receiptsError: sampleErr, sample });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e) });
  }
});
// Каталог товарів Checkbox — для зв'язування з меню.
app.get('/api/checkbox/goods', requireAuth, requireOwner, async (req, res) => {
  try {
    await cbEnsureToken();
    const all = [];
    for (let page = 0; page < 40; page++) {
      const body = await cbFetchJson('/api/v1/goods?limit=100&offset=' + (page * 100));
      const list = Array.isArray(body) ? body : ((body && (body.results || body.items)) || []);
      all.push(...list);
      if (list.length < 100) break;
    }
    res.json({ ok: true, goods: all.map(g => {
      const code = g.code !== undefined && g.code !== null ? String(g.code) : '';
      const name = String(g.name || '').trim();
      return { key: code ? 'c:' + code : 'n:' + name.toLowerCase(), code, name, price: (Number(g.price) || 0) / 100 };
    }).filter(g => g.name) });
  } catch (e) {
    res.json({ ok: false, error: String(e.message || e) });
  }
});
// Увімкнути/вимкнути: при увімкненні фіксуємо момент старту — старіші чеки в застосунок не потрапляють.
app.post('/api/checkbox/enable', requireAuth, requireOwner, (req, res) => {
  const on = !!(req.body && req.body.enabled);
  if (on) {
    if (!cbGet('login', '') || !cbGet('password', '')) return res.status(400).json({ error: 'no_credentials' });
    if (!Number(cbGet('start_from_ms', '0'))) cbSet('start_from_ms', Date.now());
    cbSet('last_sync_ms', '0');
    setTimeout(() => { cbPoll(); }, 100);
  } else {
    cbSet('start_from_ms', '0');
  }
  res.json({ ok: true });
});
app.post('/api/checkbox/sync-now', requireAuth, requireOwner, async (req, res) => {
  await cbPoll();
  res.json({ ok: true, lastError: cbGet('last_error', ''), lastSync: cbGet('last_sync_info', '') });
});
// Клієнт «забирає» чеки на 90 секунд (оренда). Підтверджує вже після того, як чек видно в збереженому
// на сервері стані, тож якщо збереження не вдалось, чек повернеться до черги.
app.post('/api/checkbox/claim', requireAuth, (req, res) => {
  const startFrom = Number(cbGet('start_from_ms', '0')) || 0;
  if (!startFrom) return res.json({ receipts: [] });
  const now = Date.now();
  const rows = db.prepare('SELECT id, data FROM checkbox_receipts WHERE applied = 0 AND created_ms >= ? AND (claimed_at IS NULL OR claimed_at < ?) ORDER BY created_ms LIMIT 30').all(startFrom, now - 90 * 1000);
  const mark = db.prepare('UPDATE checkbox_receipts SET claimed_at = ? WHERE id = ?');
  rows.forEach(r => mark.run(now, r.id));
  res.json({ receipts: rows.map(r => JSON.parse(r.data)) });
});
app.post('/api/checkbox/confirm', requireAuth, (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.slice(0, 100) : [];
  const upd = db.prepare('UPDATE checkbox_receipts SET applied = 1 WHERE id = ?');
  ids.forEach(id => upd.run(String(id)));
  res.json({ ok: true });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Сам клієнт — та ж https-адреса, яку прописуєте в BotFather як Web App URL.
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'sklad.html')));

app.listen(PORT, () => {
  console.log(`Сервер запущено на порту ${PORT}. БД: ${DB_PATH}`);
});
