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

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Сам клієнт — та ж https-адреса, яку прописуєте в BotFather як Web App URL.
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'sklad.html')));

app.listen(PORT, () => {
  console.log(`Сервер запущено на порту ${PORT}. БД: ${DB_PATH}`);
});
