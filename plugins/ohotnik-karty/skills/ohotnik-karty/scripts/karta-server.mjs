#!/usr/bin/env node
// Охотник: живая «Карта охоты» и «Табло отправок». Локальный сервер, чтобы отметки из браузера сохранялись в база.json.
// node karta-server.mjs --root "<папка, где лежат охоты (ohota)>" [--port 4790]
// GET  /<охота>/отчёт.html                – файлы охот (отчёт, база, csv)
// GET  /табло.html                        – табло отправок по всем охотам (страница – scripts/tablo.html)
// GET  /__ping                            – жив ли сервер
// GET  /__tablo                           – строки табло (кому писали) с расписанием и задачами на сегодня
// POST /__status  {hunt, n, status}       – статус (первое «написал» = касание 1, день 0)
// POST /__touch   {hunt, n, touch}        – касание 2 или 3 отправлено сегодня
// POST /__channel {hunt, n, channel}      – куда писали (WhatsApp, Telegram, MAX…)
// POST /__demo    {hunt, n, off}          – отметить, что демо снято / возвращено (само снятие – скилл публикации)
// Без зависимостей. Сам выключается через 12 часов без запросов. Слушает только 127.0.0.1.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setStatus, setTouch, setChannel, setDemo, scan, today, week, VERSION } from './kasaniya.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const root = path.resolve(arg('--root', '.'));
const port = +arg('--port', 4790);
const here = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };

let idle;
const touch = () => { clearTimeout(idle); idle = setTimeout(() => process.exit(0), 12 * 3600 * 1000); };
touch();

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Private-Network': 'true', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

// изменить одного бизнеса в базе охоты, сохранить и пересобрать отчёт
function edit(hunt, n, fn) {
  const dir = path.resolve(root, String(hunt || ''));
  if (!dir.startsWith(root + path.sep)) throw Object.assign(new Error('нет такой охоты'), { http: 400 });
  const basePath = path.join(dir, 'база.json');
  if (!fs.existsSync(basePath)) throw Object.assign(new Error('нет база.json'), { http: 404 });
  const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  const b = (base.бизнесы || []).find((x) => +x['№'] === +n);
  if (!b) throw Object.assign(new Error('нет бизнеса №' + n), { http: 404 });
  if (fn(b) !== false) {
    fs.writeFileSync(basePath, JSON.stringify(base, null, 2), 'utf8');
    execFileSync(process.execPath, [path.join(here, 'otchet.mjs'), dir], { stdio: 'ignore' }); // отчёт и csv – в тон базе
  }
  return b;
}

const ROUTES = {
  '/__status': (q) => { const b = edit(q.hunt, q.n, (b) => setStatus(b, q.status, 'карта')); return { n: +q.n, status: b.status, statusAt: b.statusAt, touches: b.touches || {} }; },
  '/__touch': (q) => { const b = edit(q.hunt, q.n, (b) => setTouch(b, q.touch, 'табло')); return { touches: b.touches, status: b.status }; },
  '/__channel': (q) => { const b = edit(q.hunt, q.n, (b) => setChannel(b, q.channel, 'карта')); return { channel: b.channel }; },
  '/__demo': (q) => { const b = edit(q.hunt, q.n, (b) => setDemo(b, !!q.off, 'табло')); return { demoOff: b.demoOff }; },
};

http.createServer((req, res) => {
  touch();
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__ping') return send(res, 200, { ok: true, root, version: VERSION });
  if (url.pathname === '/__quit' && req.method === 'POST') { send(res, 200, { ok: true }); return setTimeout(() => process.exit(0), 100); }
  if (url.pathname === '/__tablo') { try { return send(res, 200, { ok: true, today: today(), rows: scan(root), week: week(root) }); } catch (e) { return send(res, 500, { ok: false, error: e.message }); } }
  if (ROUTES[url.pathname] && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try { send(res, 200, { ok: true, ...ROUTES[url.pathname](JSON.parse(raw || '{}')) }); }
      catch (e) { send(res, e.http || 400, { ok: false, error: e.message }); }
    });
    return;
  }
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'bad path', 'text/plain'); }
  if (rel === '/табло.html' || rel === '/') return send(res, 200, fs.readFileSync(path.join(here, 'tablo.html')), TYPES['.html']);
  // статика: только файлы внутри root
  const file = path.resolve(root, '.' + rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'нет файла', 'text/plain; charset=utf-8');
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
}).listen(port, '127.0.0.1', () => console.log(`Карта охоты: http://localhost:${port}/ (папка ${root})`))
  .on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `Порт ${port} занят – сервер карты, скорее всего, уже запущен.` : e.message); process.exit(e.code === 'EADDRINUSE' ? 0 : 1); });
