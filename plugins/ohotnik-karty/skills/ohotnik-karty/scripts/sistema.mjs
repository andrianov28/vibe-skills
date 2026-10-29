#!/usr/bin/env node
// Охотник: «Запусти систему» – что из машины клиентов у ученика есть и что включать по расписанию.
// node sistema.mjs plan "<папка охот (ohota)>"    – что есть: охоты, радар, госзакупки, бот (JSON для Клода + строки для ученика)
// node sistema.mjs itogi "<папка охот>"           – итоги недели: записать в «итоги-недели.md» и прислать ботом ученику (если бот есть)
// node sistema.mjs mesyac "<папка охот>" --kasaniy 500 [--smena 3] [--dni 20]
//                                                  – план на месяц: цель в касаниях → демо, касания, отклики по дням и неделям → «план-месяца.md»
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
      hot: list.filter((x) => x.level === 'горячо').length,
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

// ---------- план на месяц ----------
// Касание – одно сообщение: владельцу (серия из 3: ссылка на демо, ролик, прощание) или отклик на заказ (радар, Kwork).
// Владельцам – 70% касаний, откликам – 30% (радара нет – всё владельцам). Ночная смена делает демо каждую ночь, 4 недели = 28 ночей.
export function mesyac(root, { kasaniy = 500, smena = 3, dni = 20 } = {}) {
  const N = Math.max(30, Math.round(kasaniy));
  const h = hunts(root);
  const radarOk = !!readJson(path.join(RADAR, 'config.json'), null);
  const owners = Math.round((radarOk ? N * 0.7 : N) / 3);
  const otkliki = Math.max(0, N - owners * 3);
  const smenaDemos = Math.min(owners, smena * 28);
  const ownDemos = owners - smenaDemos;
  const hotLeft = h.reduce((a, x) => a + x.hotLeft, 0);
  const real = h.filter((x) => x.hot > 0);
  const hotPerHunt = real.length ? Math.max(5, Math.round(real.reduce((a, x) => a + x.hot, 0) / real.length)) : 15;
  const r1 = (x) => Math.round(x);
  const range = (x) => (x < 1 ? 'меньше одного' : Number.isInteger(x) ? String(x) : Math.floor(x) + '–' + Math.ceil(x));
  const p = {
    kasaniy: N, dni, owners, otkliki, smena, smenaDemos, ownDemos, hotLeft, hunts: h.length,
    perDay: { kasaniy: r1(N / dni), first: r1(owners / dni), ownDemos: range(Math.round((ownDemos / dni) * 10) / 10), otkliki: r1(otkliki / dni), ownerMsgs: r1((owners * 3) / dni) },
    perWeek: { kasaniy: Math.round(N / 4), demos: Math.round(owners / 4), otkliki: Math.round(otkliki / 4) },
    needHunts: owners > hotLeft ? Math.ceil((owners - hotLeft) / hotPerHunt) : 0,
    gipoteza: { otvety: Math.round(N * 0.1), prodazhi: Math.max(1, Math.round(N * 0.006)), poDemo: Math.max(1, Math.round((owners / 100) * 2)) },
    radar: radarOk,
  };
  const L = [
    `🎯 План на месяц: ${N} касаний`,
    '',
    `Демо владельцам: ${owners} – каждому 3 касания (ссылка, ролик, прощание) = ${owners * 3}`,
    radarOk ? `Отклики на заказы радара и Kwork: ${otkliki}` : 'Радар не настроен – все касания владельцам («включи радар» добавит отклики)',
    '',
    `Ночная смена: ${smena} демо за ночь × 28 ночей = ${smenaDemos} демо сами`,
    ownDemos > 0 ? `Своими руками: ${ownDemos} демо – около ${p.perDay.ownDemos} в рабочий день` : 'Своими руками демо делать не нужно – смена справится' + (Math.ceil(owners / 28) < smena ? ` (хватит и ${Math.ceil(owners / 28)} демо за ночь)` : ''),
    '',
    `В рабочий день (${dni} дней): ~${p.perDay.kasaniy} касаний – ${p.perDay.ownerMsgs} владельцам${radarOk ? ' и ' + p.perDay.otkliki + ' откликов' : ''}`,
    `В неделю: ~${p.perWeek.kasaniy} касаний, ${p.perWeek.demos} новых демо${radarOk ? ', ' + p.perWeek.otkliki + ' откликов' : ''}`,
    p.perDay.ownerMsgs > 10 ? `Владельцам – больше 10 сообщений в день: делите между WhatsApp, Telegram и MAX, не больше 10 в каждом.` : 'Сообщений владельцам в день – до 10, укладываетесь в лимит одного мессенджера.',
    '',
    hotLeft >= owners ? `Горячих без демо в ваших базах: ${hotLeft} – на месяц хватит.` : `Горячих без демо в базах: ${hotLeft}, нужно ${owners} – понадобится ещё ~${p.needHunts} ${p.needHunts === 1 ? 'охота' : p.needHunts < 5 ? 'охоты' : 'охот'}: «запусти охотника» в соседнем городе или смежной нише.`,
    '',
    'По неделям:',
    '1 – разгон: система включена, первые серии касаний, витрина под себя',
    '2 – ровный ритм: каждый день по плану',
    '3 – разговоры: отвечаете тем, кто откликнулся, ведёте к оплате',
    '4 – итоги: первый кейс в витрину, решаем, где охотиться дальше',
    '',
    `Стартовая гипотеза (холодные сообщения без демо): ${N} касаний → ~${p.gipoteza.otvety} ответов → ~${p.gipoteza.prodazhi} ${p.gipoteza.prodazhi === 1 ? 'продажа' : p.gipoteza.prodazhi < 5 ? 'продажи' : 'продаж'}. С демо, роликом и ботом – задача её побить.`,
  ];
  const text = L.join('\n');
  fs.writeFileSync(path.join(root, 'план-месяца.md'), text + '\n', 'utf8');
  return { ...p, text, file: path.join(root, 'план-месяца.md') };
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
  } else if (cmd === 'mesyac') {
    const a = process.argv.slice(2), num = (n, d) => { const i = a.indexOf(n); return i > -1 ? +a[i + 1] || d : d; };
    const r = mesyac(root, { kasaniy: num('--kasaniy', 500), smena: num('--smena', 3), dni: num('--dni', 20) });
    console.log(r.text);
    console.log('\nфайл: ' + r.file);
  } else { console.error('команды: plan | itogi | mesyac'); process.exit(1); }
}
