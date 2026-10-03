#!/usr/bin/env node
// Охотник: живая «Карта охоты». Маленький локальный сервер, чтобы статусы из отчёта сохранялись в база.json.
// node karta-server.mjs --root "<папка, где лежат охоты (ohota)>" [--port 4790]
// GET  /<охота>/отчёт.html            – файлы охот (отчёт, база, csv)
// GET  /__ping                         – жив ли сервер
// POST /__status {hunt, n, status}     – статус бизнеса №n в охоте hunt → база.json (+ statusAt, statusLog) и пересборка отчёта
// Без зависимостей. Сам выключается через 12 часов без запросов. Слушает только 127.0.0.1.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const root = path.resolve(arg('--root', '.'));
const port = +arg('--port', 4790);
const here = path.dirname(fileURLToPath(import.meta.url));
const STATUSES = ['новый', 'написал', 'ответил', 'оплатил', 'отказ'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

let idle;
const touch = () => { clearTimeout(idle); idle = setTimeout(() => process.exit(0), 12 * 3600 * 1000); };
touch();

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Private-Network': 'true', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

http.createServer((req, res) => {
  touch();
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__ping') return send(res, 200, { ok: true, root });
  if (url.pathname === '/__status' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        const { hunt, n, status } = JSON.parse(raw || '{}');
        if (!STATUSES.includes(status)) return send(res, 400, { ok: false, error: 'неизвестный статус' });
        const dir = path.resolve(root, String(hunt || ''));
        if (!dir.startsWith(root + path.sep)) return send(res, 400, { ok: false, error: 'нет такой охоты' });
        const basePath = path.join(dir, 'база.json');
        if (!fs.existsSync(basePath)) return send(res, 404, { ok: false, error: 'нет база.json' });
        const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
        const b = (base.бизнесы || []).find((x) => +x['№'] === +n);
        if (!b) return send(res, 404, { ok: false, error: 'нет бизнеса №' + n });
        if (b.status !== status) {
          b.status = status; b.statusAt = today();
          (b.statusLog = b.statusLog || []).push({ status, at: ((d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'))(new Date()), from: 'карта' });
          fs.writeFileSync(basePath, JSON.stringify(base, null, 2), 'utf8');
          execFileSync(process.execPath, [path.join(here, 'otchet.mjs'), dir], { stdio: 'ignore' }); // отчёт и csv – в тон базе
        }
        send(res, 200, { ok: true, n: +n, status: b.status, statusAt: b.statusAt });
      } catch (e) { send(res, 500, { ok: false, error: e.message }); }
    });
    return;
  }
  // статика: только файлы внутри root
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'bad path', 'text/plain'); }
  const file = path.resolve(root, '.' + rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'нет файла', 'text/plain; charset=utf-8');
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
}).listen(port, '127.0.0.1', () => console.log(`Карта охоты: http://localhost:${port}/ (папка ${root})`))
  .on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `Порт ${port} занят – сервер карты, скорее всего, уже запущен.` : e.message); process.exit(e.code === 'EADDRINUSE' ? 0 : 1); });
