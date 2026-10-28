#!/usr/bin/env node
// Охотник: «Пульт» – всё, что приводит клиентов, на одной странице (это и есть CRM ученика).
//   Сегодня по охотам (табло) · заявки из бота · заказы радара (Telegram, Kwork) · госзакупки · неделя.
// node pult.mjs "<папка охот (ohota)>"          – сводка текстом (для Клода: «что на пульте?»)
// node pult.mjs "<папка охот>" --json           – то же в JSON
// node pult.mjs "<папка охот>" --open           – открыть пульт в браузере (сервер карты, /пульт.html)
// Источники ищем рядом с папкой охот: бот – ~/.vibe/radar/config.json или <рабочая папка>/bot, госзакупки – <рабочая папка>/госзакупки.
// Статусы заявок – в <папка бота>/заявки.json, статусы заказов радара – в ~/.vibe/radar/zakazy.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, ready, week, today } from './kasaniya.mjs';

const HOME = os.homedir();
const RADAR = path.join(HOME, '.vibe', 'radar');
export const LEAD_ST = ['новая', 'написал', 'в работе', 'оплатил', 'мимо'];
export const ORDER_ST = ['новый', 'откликнулся', 'ответил', 'взял', 'мимо'];
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2), 'utf8');
const readEnv = (dir) => { const env = {}; try { for (const l of fs.readFileSync(path.join(dir, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch {} return env; };

export function botDir(root) {
  const cfg = readJson(path.join(RADAR, 'config.json'), {});
  for (const d of [cfg.bot, path.join(path.dirname(root), 'bot')]) if (d && fs.existsSync(path.join(d, 'bot.json'))) return d;
  return null;
}

// заявки: забрать новые из Cloudflare (бот 1.2.0+) и вернуть всё из заявки.json
export async function leads(root) {
  const dir = botDir(root);
  if (!dir) return { bot: false, leads: [], note: 'бот не найден – урок про бота' };
  const f = path.join(dir, 'заявки.json');
  const base = readJson(f, { leads: [] });
  const cfg = readJson(path.join(dir, 'bot.json'), {}), key = readEnv(dir).WEBHOOK_SECRET;
  let note = null;
  if (cfg.workerUrl && key) {
    try {
      const raw = await fetch(cfg.workerUrl + '/leads', { headers: { 'X-Owner-Key': key }, signal: AbortSignal.timeout(8000) }).then((x) => x.text());
      let r; try { r = JSON.parse(raw); } catch { r = { ok: false }; }
      if (r.ok) {
        const have = new Set(base.leads.map((l) => l.key));
        const fresh = r.leads.filter((l) => !have.has(l.key)).map((l) => ({ ...l, status: 'новая', statusAt: l.at.slice(0, 10) }));
        if (fresh.length) { base.leads.push(...fresh); writeJson(f, base); }
        if (r.leads.length) await fetch(cfg.workerUrl + '/leads/done', { method: 'POST', headers: { 'X-Owner-Key': key, 'content-type': 'application/json' }, body: JSON.stringify({ keys: r.leads.map((l) => l.key) }), signal: AbortSignal.timeout(8000) }).catch(() => {});
      } else note = 'бот старой версии – скажите «выложи бота», и заявки начнут попадать на пульт';
    } catch { note = 'Cloudflare не ответил – заявки подтянутся при следующем открытии'; }
  } else note = 'бот ещё не выложен';
  base.leads.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { bot: true, dir, leads: base.leads, note };
}
export function setLead(root, key, status) {
  if (!LEAD_ST.includes(status)) throw new Error('статус заявки: ' + LEAD_ST.join(', '));
  const dir = botDir(root); if (!dir) throw new Error('бот не найден');
  const f = path.join(dir, 'заявки.json'), base = readJson(f, { leads: [] });
  const l = base.leads.find((x) => x.key === key); if (!l) throw new Error('нет такой заявки');
  l.status = status; l.statusAt = today(); writeJson(f, base); return l;
}

// заказы радара: последний сбор (sbor.json) копим в zakazy.json, чтобы статусы не терялись
export function orders() {
  const f = path.join(RADAR, 'zakazy.json');
  const base = readJson(f, { orders: [] });
  const sbor = readJson(path.join(RADAR, 'sbor.json'), { tg: [] });
  const have = new Set(base.orders.map((o) => o.url));
  let add = 0;
  for (const o of sbor.tg || []) if (o.url && !have.has(o.url)) { base.orders.push({ url: o.url, kanal: o.kanal, d: o.d, contact: o.contact || null, t: String(o.t || '').slice(0, 600), status: 'новый', statusAt: today() }); add++; }
  if (add) { fs.mkdirSync(RADAR, { recursive: true }); writeJson(f, base); }
  base.orders.sort((a, b) => (a.d < b.d ? 1 : -1));
  const svodki = path.join(RADAR, 'svodki');
  const last = fs.existsSync(svodki) ? fs.readdirSync(svodki).filter((x) => x.endsWith('.md')).sort().pop() : null;
  return { radar: fs.existsSync(path.join(RADAR, 'config.json')), orders: base.orders, svodka: last ? { date: last.slice(0, 10), file: path.join(svodki, last), text: fs.readFileSync(path.join(svodki, last), 'utf8') } : null };
}
export function setOrder(url, status) {
  if (!ORDER_ST.includes(status)) throw new Error('статус заказа: ' + ORDER_ST.join(', '));
  const f = path.join(RADAR, 'zakazy.json'), base = readJson(f, { orders: [] });
  const o = base.orders.find((x) => x.url === url); if (!o) throw new Error('нет такого заказа');
  o.status = status; o.statusAt = today(); writeJson(f, base); return o;
}

// госзакупки: последний поиск скилла «Госзакупки»
export function tenders(root) {
  const f = path.join(path.dirname(root), 'госзакупки', 'последний-поиск.json');
  if (!fs.existsSync(f)) return { have: false, list: [] };
  const list = readJson(f, []).map((z) => ({ num: z.num, obj: z.obj, cust: z.cust, price: z.price, end: (z.c && z.c.end) || z.end || null, url: z.url, smp: !!(z.c && z.c.smp) }));
  return { have: true, date: fs.statSync(f).mtime.toISOString().slice(0, 10), list };
}

export async function pultData(root) {
  const rows = scan(root);
  const tasks = rows.flatMap((r) => r.tasks.map((t) => ({ ...t, n: r.n, name: r.name, hunt: r.hunt, city: r.city, niche: r.niche, channel: r.channel })));
  return { ok: true, today: today(), tasks, ready: ready(root), talking: rows.filter((r) => r.status === 'ответил').map((r) => ({ n: r.n, name: r.name, hunt: r.hunt, city: r.city, niche: r.niche, channel: r.channel })),
    week: week(root), bot: await leads(root), radar: orders(), tenders: tenders(root) };
}

// ---------- запуск из командной строки ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const root = path.resolve(args.find((a) => !a.startsWith('--')) || '.');
  if (!fs.existsSync(root)) { console.error('✗ нет папки охот: ' + root); process.exit(1); }
  if (args.includes('--open')) {
    const { ensureServer, openInBrowser } = await import('./server-start.mjs');
    const up = await ensureServer(root);
    if (up) { openInBrowser(up + '/' + encodeURIComponent('пульт.html')); console.log(`Открыл пульт: ${up}/пульт.html`); }
    else console.log('Сервер карты не запустился – пульт не открыть. Сводка – ниже.');
  }
  const p = await pultData(root);
  if (args.includes('--json')) { console.log(JSON.stringify(p, null, 2)); process.exit(0); }
  const d = (x) => (x ? x.slice(8, 10) + '.' + x.slice(5, 7) : '–');
  const newLeads = p.bot.leads.filter((l) => l.status === 'новая');
  const newOrders = p.radar.orders.filter((o) => o.status === 'новый');
  console.log(`Пульт · ${d(p.today)}`);
  console.log(`- Заявки из бота: новых ${newLeads.length}, всего ${p.bot.leads.length}${p.bot.note ? ' (' + p.bot.note + ')' : ''}`);
  for (const l of newLeads) console.log(`    ${d(l.at)} ${l.who}: ${l.answers.map((a) => a.a).filter(Boolean).join(' · ').slice(0, 120)}`);
  console.log(`- В разговоре (ответили на демо): ${p.talking.length}${p.talking.length ? ' – ' + p.talking.map((r) => `№${r.n} ${r.name}`).join(', ') : ''}`);
  console.log(`- Касания на сегодня: ${p.tasks.length}; первых сообщений готово: ${p.ready.length}`);
  console.log(`- Заказы радара в Telegram: новых ${newOrders.length}, всего ${p.radar.orders.length}${p.radar.svodka ? ', последняя сводка ' + d(p.radar.svodka.date) : p.radar.radar ? '' : ' (радар не настроен)'}`);
  console.log(`- Госзакупки: ${p.tenders.have ? `${p.tenders.list.length} в поиске от ${d(p.tenders.date)}` : 'поиска ещё не было'}`);
  const w = p.week;
  console.log(`- Неделя: демо ${w.demos} из ${w.plan}, первых сообщений ${w.first}, ответили ${w.replied}, оплатили ${w.paid}`);
}
