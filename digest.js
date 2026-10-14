'use strict';
// Щоденний підсумок для власника в Telegram + побудова тексту з поточного стану (без залежностей).
// Налаштування через змінні середовища: TG_BOT_TOKEN, TG_CHAT_ID (кілька через кому), DIGEST_HOUR (за замовч. 22), DIGEST_TZ (Europe/Kyiv).
const fs = require('fs');
const path = require('path');

const TZ = process.env.DIGEST_TZ || 'Europe/Kyiv';

function dateKeyInTz(d) { return d.toLocaleDateString('sv', { timeZone: TZ }); } // YYYY-MM-DD
function hourInTz(d) { return Number(d.toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).slice(0, 2)) % 24; }
const fmtNum = (n) => { const x = Number(n) || 0; return (Math.round(x * 100) / 100).toLocaleString('uk-UA'); };
const money = (n) => fmtNum(Math.round(Number(n) || 0)) + ' ₴';
const norm = (s) => String(s || '').trim().toLowerCase();

function buildDigest(data, now) {
  now = now || new Date();
  data = data || {};
  const today = dateKeyInTz(now);
  const locs = data.locations || [];
  const locName = (id) => (locs.find((l) => l.id === id) || {}).name || '—';
  const whName = (id) => ((data.warehouses || []).find((w) => w.id === id) || {}).name || '—';
  const staffName = (id) => ((data.staff || []).find((s) => s.id === id) || {}).name || '—';
  const lines = [];
  const [y, m, d] = today.split('-');
  lines.push(`📊 Підсумок дня · ${d}.${m}`);

  // Продажі за сьогодні по точках
  const salesToday = (data.sales || []).filter((s) => s.dateKey === today);
  lines.push('');
  if (salesToday.length === 0) lines.push('Продажі: сьогодні ще не було');
  else {
    const by = {}; let total = 0;
    salesToday.forEach((s) => { const k = s.locationId; by[k] = by[k] || { sum: 0, n: 0 }; by[k].sum += Number(s.amount) || 0; by[k].n++; total += Number(s.amount) || 0; });
    lines.push(`Продажі: ${money(total)}`);
    Object.keys(by).forEach((k) => lines.push(`  • ${locName(k)}: ${money(by[k].sum)} (${by[k].n} зам.)`));
  }

  // Закриття змін
  const sched = (data.shiftSchedule || []).filter((e) => e.dateKey === today);
  const closings = (data.shiftClosings || []).filter((c) => c.dateKey === today);
  if (sched.length) {
    const closedIds = new Set(closings.map((c) => c.staffId));
    const open = sched.filter((e) => !closedIds.has(e.staffId));
    lines.push('');
    if (open.length === 0) lines.push(`Зміни: усі закрито ✅ (${sched.length})`);
    else lines.push('Зміни: не закрито ⚠ ' + open.map((e) => `${staffName(e.staffId)} (${locName(e.locationId)})`).join(', '));
  }
  const bad = [];
  closings.forEach((c) => (c.lines || []).forEach((l) => { if (l.diff) bad.push(`${l.name} ${l.diff > 0 ? '+' : ''}${fmtNum(l.diff)} ${l.unit} (${locName(c.locationId)}, ${c.staffName})`); }));
  if (bad.length) { lines.push('Розбіжності при закритті зміни:'); bad.slice(0, 10).forEach((b) => lines.push('  • ' + b)); }

  // Витрати на розхідники
  const su = (data.supplyUsage || []).filter((r) => r.dateKey === today);
  if (su.length) lines.push('', `Розхідники за день: ${money(su.reduce((a, r) => a + (Number(r.cost) || 0), 0))}`);

  // Що чекає рішення
  const pendingCorr = (data.transferCorrections || []).filter((c) => c.status === 'PENDING').length;
  if (pendingCorr) lines.push('', `⏳ Виправлень поставок на підтвердження: ${pendingCorr}`);
  const stuck = (data.transfers || []).filter((t) => t.status === 'SENT' && t.createdMs && now.getTime() - t.createdMs > 24 * 3600 * 1000);
  if (stuck.length) lines.push(`🚚 Поставок в дорозі понад добу: ${stuck.length}`);

  // Мало на складі (мінімум діє лише для фастфуду)
  const low = (data.stockItems || []).filter((i) => i.category === 'fastfood' && Number(i.min) > 0 && Number(i.qty) <= Number(i.min));
  if (low.length) {
    lines.push('', '📉 Мало на складі:');
    const byWh = {};
    low.forEach((i) => { (byWh[i.warehouseId] = byWh[i.warehouseId] || []).push(`${i.name} ${fmtNum(i.qty)}/${fmtNum(i.min)} ${i.unit}`); });
    Object.keys(byWh).forEach((w) => lines.push(`  ${whName(w)}: ${byWh[w].slice(0, 8).join(', ')}${byWh[w].length > 8 ? '…' : ''}`));
  }
  const neg = (data.stockItems || []).filter((i) => Number(i.qty) < 0);
  if (neg.length) lines.push('', `⚠ Від'ємний залишок: ${neg.slice(0, 6).map((i) => `${i.name} (${whName(i.warehouseId)})`).join(', ')}`);

  return lines.join('\n');
}

function cfg() {
  const token = process.env.TG_BOT_TOKEN || '';
  const chats = String(process.env.TG_CHAT_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
  return { token, chats, configured: !!(token && chats.length), hour: Number(process.env.DIGEST_HOUR || 22) };
}

async function sendTelegram(text) {
  const c = cfg();
  if (!c.configured) return { ok: false, error: 'not_configured' };
  let sent = 0, lastErr = null;
  for (const chat of c.chats) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(`https://api.telegram.org/bot${c.token}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true })
      });
      clearTimeout(t);
      if (r.ok) sent++; else lastErr = 'telegram_' + r.status;
    } catch (e) { lastErr = 'network'; }
  }
  return sent ? { ok: true, sent } : { ok: false, error: lastErr || 'failed' };
}

// getData() → поточний стан (об'єкт). Раз на добу після DIGEST_HOUR (за часом TZ) шле підсумок; останню дату зберігає у файлі.
function startDigestScheduler(getData, dataDir) {
  const markFile = path.join(dataDir, 'digest_last.txt');
  const tick = async () => {
    try {
      const c = cfg(); if (!c.configured) return;
      const now = new Date();
      if (hourInTz(now) < c.hour) return;
      const today = dateKeyInTz(now);
      let last = ''; try { last = fs.readFileSync(markFile, 'utf8').trim(); } catch (e) {}
      if (last === today) return;
      const res = await sendTelegram(buildDigest(getData(), now));
      if (res.ok) { try { fs.writeFileSync(markFile, today); } catch (e) {} console.log('Підсумок дня надіслано'); }
      else console.error('Підсумок дня не надіслано:', res.error);
    } catch (e) { console.error('digest tick', e.message); }
  };
  setInterval(tick, 60 * 1000).unref();
  setTimeout(tick, 15 * 1000).unref();
}

module.exports = { buildDigest, sendTelegram, startDigestScheduler, cfg, dateKeyInTz, hourInTz };
