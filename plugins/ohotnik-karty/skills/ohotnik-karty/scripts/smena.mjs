#!/usr/bin/env node
// Ночная смена Охотника: кого сегодня взять в работу.
// node smena.mjs pick "<папка охоты>" [--n 3]   – N самых горячих без демо (статус «новый», сайт не живой), по индексу
// node smena.mjs log  "<папка охоты>" "<текст>" – дописать строку в «смены.md» папки охоты (что сделано за смену)
import fs from 'node:fs';
import path from 'node:path';
import { today } from './kasaniya.mjs';

const [cmd, dir, ...rest] = process.argv.slice(2);
if (!dir) { console.log('команды: pick <папка охоты> [--n 3] | log <папка охоты> "<текст>"'); process.exit(0); }
const basePath = path.join(path.resolve(dir), 'база.json');
if (!fs.existsSync(basePath)) { console.error(`✗ нет базы: ${basePath}`); process.exit(1); }
const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
const list = base.бизнесы || [];

if (cmd === 'pick') {
  const i = rest.indexOf('--n'); const n = i > -1 ? Math.max(1, +rest[i + 1] || 3) : 3;
  const free = list.filter((b) => !b.demoUrl && (!b.status || b.status === 'новый') && b.siteVerdict !== 'живой' && b.message)
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  const hot = free.filter((b) => (b.score || 0) >= 70);
  const take = free.slice(0, n).map((b) => ({ n: b['№'], name: b.name, index: b.score || 0, id: b.id, url: b.url, socials: (b.socials || []).map((s) => s.kind) }));
  console.log(JSON.stringify({ hunt: path.basename(path.resolve(dir)), city: base.город, niche: base.ниша, slug: base.слаг, take, hotLeft: hot.length - take.filter((t) => t.index >= 70).length, freeLeft: free.length - take.length }, null, 2));
  if (free.length < n) console.log(`○ свободных без демо меньше ${n}: сначала «продолжи охоту» (добрать 10 новых)`);
} else if (cmd === 'log') {
  const f = path.join(path.resolve(dir), 'смены.md');
  if (!fs.existsSync(f)) fs.writeFileSync(f, '# Ночные смены\n\n');
  fs.appendFileSync(f, `- ${today()}: ${rest.join(' ')}\n`);
  console.log(`✓ записано в ${f}`);
}
