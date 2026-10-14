'use strict';
// Запускає всі *.test.js по черзі. Тест вважається пройденим, якщо вивів "ALL PASS"/"ALL PASSED" і не вивів жодного "FAIL".
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const only = process.argv.slice(2);
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).filter(f => !only.length || only.some(o => f.startsWith(o))).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync('node', [path.join(__dirname, f)], { encoding: 'utf8', timeout: 180000, env: process.env });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = r.status === 0 && /ALL PASS/.test(out) && !/^FAIL /m.test(out) && !/PAGEERR/.test(out);
  console.log((ok ? 'ok   ' : 'FAIL ') + f);
  if (!ok) { failed++; console.log(out.split('\n').filter(l => /FAIL|PAGEERR|Error/.test(l)).slice(0, 8).map(l => '     ' + l).join('\n')); }
}
console.log(failed ? `\n${failed} з ${files.length} тестів не пройшли` : `\nУсі ${files.length} тестів пройшли`);
process.exit(failed ? 1 : 0);
