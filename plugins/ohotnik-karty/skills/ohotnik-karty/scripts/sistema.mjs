#!/usr/bin/env node
// Охотник: «Запусти систему» – что из машины клиентов у ученика есть и что включать по расписанию.
// node sistema.mjs plan "<папка охот (ohota)>"    – что есть: охоты, радар, госзакупки, бот (JSON для Клода + строки для ученика)
// node sistema.mjs itogi "<папка охот>"           – итоги недели: записать в «итоги-недели.md» и прислать ботом ученику (если бот есть)
// Задачи по расписанию создаёт Клод (scheduled-tasks) по references/sistema.md, этот скрипт их не трогает.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { week } from './kasaniya.mjs';
import { botDir, leads, orders, tenders } from './pult.mjs';

const HOME = os.homedir();
const RADAR = path.join(HOME, '.vibe', 'radar');
const CACHE = path.join(HOME, '.claude', 'plugins', 'cache', 'vibe-skills');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const readEnv = (dir) => { const env = {}; try { for (const l of fs.readFileSync(path.join(dir, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch {} return env; };
const dm = (x) => x.slice(8, 10) + '.' + x.slice(5, 7);

// охоты, свежая – первой (по дате изменения базы)
function hunts(root) {
  const out = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const f = path.join(root, e.name, 'база.json');
    if (!fs.existsSync(f)) continue;
    const b = readJson(f, {});
    const list = b.бизнесы || [];
    out.push({ hunt: e.name, dir: path.join(root, e.name), city: b.город || b.city || '', niche: b.ниша || b.niche || '',
      hotLeft: list.filter((x) => x.level === 'горячо' && !x.demoUrl && (!x.status || x.status === 'новый')).length,
      at: fs.statSync(f).mtimeMs });
  }
  return out.sort((a, b) => b.at - a.at);
}

export function plan(root) {
  const h = hunts(root);
  const radarCfg = readJson(path.join(RADAR, 'config.json'), null);
  const kanaly = readJson(path.join(RADAR, 'kanaly.json'), null);
  const gz = fs.existsSync(path.join(CACHE, 'goszakupki'));
  const bot = botDir(root);
  const botLive = !!(bot && readJson(path.join(bot, 'bot.json'), {}).workerUrl);
  const video = fs.existsSync(path.join(HOME, '.vibe', 'video'));
  return {
    root, workdir: path.dirname(root),
    smena: { ok: h.length > 0, hunts: h.map(({ at, ...x }) => x), why: h.length ? null : 'ещё нет ни одной охоты – «запусти охотника»' },
    radar: { ok: !!radarCfg, kanaly: Array.isArray(kanaly) ? kanaly.length : (kanaly && kanaly.list ? kanaly.list.length : null), why: radarCfg ? null : 'радар не настроен – «найди мне каналы с заказами», потом «включи радар»' },
    goszakupki: { ok: gz, why: gz ? null : 'скилл «Госзакупки» не включён – урок «Простые тендеры»' },
    itogi: { ok: true, bot: botLive, why: botLive ? null : 'бота нет – итоги будут в файле, бот их не пришлёт' },
    video, bot: botLive,
  };
}

export async function itogi(root) {
  const w = week(root);
  const b = await leads(root), r = orders(), t = tenders(root);
  const inWeek = (x) => !!x && x.slice(0, 10) >= w.from && x.slice(0, 10) <= w.to;
  const lw = b.leads.filter((l) => inWeek(l.at));
  const ow = r.orders.filter((o) => inWeek(o.statusAt) && o.status !== 'новый');
  const lines = [
    `📊 Итоги недели · ${dm(w.from)}–${dm(w.to)}`,
    '',
    `Демо опубликовано: ${w.demos} из плана ${w.plan}`,
    `Первых сообщений: ${w.first} · вторых (ролик): ${w.t2} · прощаний: ${w.t3}`,
    `Ответили: ${w.replied} · оплатили: ${w.paid} · сейчас в разговоре: ${w.talking}`,
    `Заявки из бота: ${lw.length}${lw.length ? ' (оплатили: ' + lw.filter((l) => l.status === 'оплатил').length + ')' : ''}`,
    `Заказы радара в работе: ${ow.length} из ${r.orders.length}`,
    t.have ? `Госзакупки: ${t.list.length} в последнем поиске` : null,
    '',
    w.hotLeft < 10 ? `Горячих без демо осталось ${w.hotLeft} – пора в соседний город или смежную нишу: «запусти охотника».` : `Горячих без демо в базах: ${w.hotLeft} – смене есть с кем работать.`,
    w.demos < w.plan ? 'Отставание от плана – на следующей неделе пусть ночная смена делает на 1–2 демо больше.' : 'План по демо выполнен – так держать.',
  ].filter((x) => x !== null);
  const text = lines.join('\n');
  fs.writeFileSync(path.join(root, 'итоги-недели.md'), text + '\n', 'utf8');
  let sent = false, note = null;
  const dir = botDir(root);
  if (dir) {
    const cfg = readJson(path.join(dir, 'bot.json'), {}), tok = readEnv(dir).BOT_TOKEN;
    if (cfg.ownerChatId && tok) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: cfg.ownerChatId, text }), signal: AbortSignal.timeout(10000) }).then((x) => x.json());
        sent = !!res.ok; if (!res.ok) note = 'Telegram не принял: ' + (res.description || '');
      } catch { note = 'нет связи с Telegram'; }
    } else note = 'у бота нет токена или чата владельца';
  } else note = 'бота нет – итоги только в файле';
  return { text, file: path.join(root, 'итоги-недели.md'), sent, note };
}

// ---------- запуск из командной строки ----------
const [cmd, dirArg] = process.argv.slice(2);
if (cmd) {
  const root = path.resolve(dirArg || '.');
  if (!fs.existsSync(root)) { console.error('✗ нет папки охот: ' + root); process.exit(1); }
  if (cmd === 'plan') {
    const p = plan(root);
    console.log(JSON.stringify(p, null, 2));
    console.log('\nЧто включится:');
    console.log(`- Ночная смена: ${p.smena.ok ? 'да – охота «' + p.smena.hunts[0].hunt + '» (' + [p.smena.hunts[0].city, p.smena.hunts[0].niche].filter(Boolean).join(', ') + ')' : 'нет – ' + p.smena.why}`);
    console.log(`- Утренний радар: ${p.radar.ok ? 'да' : 'нет – ' + p.radar.why}`);
    console.log(`- Госзакупки по понедельникам: ${p.goszakupki.ok ? 'да' : 'нет – ' + p.goszakupki.why}`);
    console.log(`- Итоги недели по пятницам: да${p.itogi.bot ? ' (пришлёт бот)' : ' – ' + p.itogi.why}`);
  } else if (cmd === 'itogi') {
    const r = await itogi(root);
    console.log(r.text);
    console.log(`\n${r.sent ? '✓ бот прислал итоги в Telegram' : '– ' + r.note}; файл: ${r.file}`);
  } else { console.error('команды: plan | itogi'); process.exit(1); }
}
