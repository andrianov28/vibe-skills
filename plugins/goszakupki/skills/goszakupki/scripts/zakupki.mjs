#!/usr/bin/env node
// Госзакупки сайтов: поиск в ЕИС (zakupki.gov.ru, без входа) и разбор одной закупки.
//   node zakupki.mjs poisk [--days 7] [--max 1000000] [--min 0] [--papka "<папка отчётов>"]
//        – закупки на создание / разработку сайта, размещённые за последние N дней, на этапе подачи заявок, до суммы
//   node zakupki.mjs razbor <номер закупки> [--papka "<папка>"]
//        – карточка закупки + документы (скачать, docx → txt) для разбора Клодом
//   node zakupki.mjs bot "<файл .md>"   – отправить отчёт себе через бота ученика (если бот подключён к радару или --bot-dir)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const EIS = 'https://zakupki.gov.ru';
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const [cmd, ...rest] = process.argv.slice(2);
const ok = (s) => console.log('✓ ' + s), fail = (s) => { console.error('✗ ' + s); process.exit(1); };
const txt = (x) => (x || '').replace(/<\/?span[^>]*>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#8381;/g, ' ').replace(/&quot;/g, '"').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
const ddmmyyyy = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
const rub = (s) => +String(s || '').replace(/[^\d,]/g, '').replace(',', '.') || 0;
const fmt = (n) => n ? n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽' : '–';
async function get(u) { const r = await fetch(u.startsWith('http') ? u : EIS + u, { headers: UA, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error('ЕИС ответил ' + r.status); return r.text(); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// создание сайта с нуля – да; только поддержка / размещение материалов / защита / хостинг – нет
const MAKE = /(созда|разработ|изготовл|запуск)[а-яё]*\s+(и\s+[а-яё]+\s+)?(нового\s+)?(официальн[а-яё]*\s+)?(веб-?|интернет-?)?(сайт|портал|лендинг)|сайт[а-]*лендинг|лендинг|одностранич/i;
const SKIP = /(неисключительн|лицензи|размещени[ея]\s+(информац|материал|на\s+(официальн|сайт))|информационн[а-яё]+ материал|защит|ddos|хостинг|ремонт|проектно-сметн|сопровождени[ея]\s+(официальн|сайт)(?!.*(созда|разработ)))/i;

function parseList(s) {
  return s.split('search-registry-entry-block').slice(1).map((b) => {
    const g = (re) => txt((b.match(re) || [])[1]);
    const href = (b.match(/href="(\/epz\/order\/notice\/[^"]*?(common-info|contract-info)[^"]*?)"/) || [])[1] || '';
    return {
      num: g(/№ ([0-9]{11,})/), law: g(/header-top__title[^>]*>([\s\S]*?)<\/div>/), etap: g(/header-mid__title[^>]*>([\s\S]*?)<\/div>/),
      obj: g(/Объект закупки<\/div>\s*<div class="registry-entry__body-value">([\s\S]*?)<\/div>/),
      cust: g(/Заказчик<\/div>\s*<div class="registry-entry__body-href">([\s\S]*?)<\/div>\s*<\/div>/),
      price: rub(g(/price-block__value"[^>]*>([\s\S]*?)<\/div>/)), pub: g(/Размещено<\/div>\s*<div class="data-block__value">([\s\S]*?)<\/div>/),
      end: g(/Окончание подачи заявок<\/div>\s*<div class="data-block__value">([\s\S]*?)<\/div>/),
      url: href ? EIS + href.replace('contract-info', 'common-info').replace(/&amp;/g, '&') : '',
    };
  });
}

async function card(url) {
  const s = await get(url);
  const f = {};
  for (const m of s.matchAll(/<span class="section__title">([\s\S]*?)<\/span>\s*<span class="section__info">([\s\S]*?)<\/span>/g)) { const k = txt(m[1]); if (!f[k]) f[k] = txt(m[2]); }
  // 223-ФЗ: другая разметка – пары td
  for (const m of s.matchAll(/<td[^>]*>\s*([^<]{3,120}?)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g)) { const k = txt(m[1]); if (k && !f[k]) f[k] = txt(m[2]).slice(0, 400); }
  const pick = (...keys) => { for (const k of Object.keys(f)) if (keys.some((x) => k.toLowerCase().includes(x))) return f[k]; return ''; };
  return {
    f,
    region: pick('регион'),
    obespZ: pick('требуется обеспечение заявки'), obespZsum: pick('размер обеспечения заявки'),
    obespK: pick('требуется обеспечение исполнения'), obespKsum: pick('размер обеспечения исполнения'),
    end: pick('окончания срока подачи', 'дата и время окончания подачи'),
    srok: pick('срок исполнения контракта', 'срок исполнения договора'),
    smp: /малого предпринимательства|ч\. 3 ст\. 30|субъект[а-я]* мсп|только субъект/i.test(s) ? 'да' : '',
    ploshadka: pick('наименование электронной площадки', 'адрес электронной площадки'),
  };
}

if (cmd === 'poisk') {
  const days = +arg('--days', 7), max = +arg('--max', 1000000), min = +arg('--min', 0);
  const from = ddmmyyyy(new Date(Date.now() - days * 864e5));
  const papka = path.resolve(arg('--papka', path.join(process.cwd(), 'госзакупки')));
  fs.mkdirSync(papka, { recursive: true });
  const Q = ['создание сайта', 'разработка сайта', 'разработка официального сайта', 'создание веб-сайта', 'сайт-лендинг', 'разработка портала'];
  const seen = new Map(); let total = 0;
  for (const q of Q) {
    for (let p = 1; p <= 3; p++) {
      const u = `/epz/order/extendedsearch/results.html?searchString=${encodeURIComponent(q)}&morphology=on&fz44=on&fz223=on&af=on&publishDateFrom=${from}&sortBy=PUBLISH_DATE&sortDirection=false&recordsPerPage=_50&pageNumber=${p}&priceFromGeneral=${min}&priceToGeneral=${max}`;
      let list; try { list = parseList(await get(u)); } catch (e) { console.log(`○ поиск «${q}»: ${e.message}`); break; }
      total += list.length;
      for (const z of list) if (z.num && !seen.has(z.num)) seen.set(z.num, z);
      if (list.length < 50) break;
      await sleep(600);
    }
  }
  const found = [...seen.values()].filter((z) => MAKE.test(z.obj) && !SKIP.test(z.obj) && (!z.price || z.price <= max));
  for (const z of found) { try { Object.assign(z, { c: await card(z.url) }); } catch { z.c = {}; } await sleep(500); }
  found.sort((a, b) => b.price - a.price);
  const date = ddmmyyyy(new Date());
  const lines = [`# Госзакупки сайтов · ${date}`, '', `Период: размещены с ${from} (${days} дн.), этап – подача заявок, цена до ${fmt(max)}. Источник – ЕИС zakupki.gov.ru (44-ФЗ и 223-ФЗ). Просмотрено карточек: ${total}, на создание сайта: ${found.length}.`, ''];
  if (!found.length) lines.push(days < 30
    ? 'За этот период новых закупок на создание сайта нет. Попробуйте период побольше: «госзакупки за месяц».'
    : 'За этот период открытых закупок на создание сайта нет – такие закупки бывают редко, а подача длится 1–2 недели. Посмотрите, что покупали раньше и за сколько: «покажи рынок госзакупок».');
  found.forEach((z, i) => {
    const c = z.c || {};
    const ob = /да/i.test(c.obespZ || '') ? `да, ${c.obespZsum || 'размер в документах'}` : (c.obespZ ? 'нет' : '–');
    lines.push(`## ${i + 1}. ${z.obj}`);
    lines.push(`- Заказчик: ${z.cust || '–'}${c.region ? ' · ' + c.region : ''}`);
    lines.push(`- Начальная цена: **${fmt(z.price)}** · ${z.law}`);
    lines.push(`- Подача заявок до: **${c.end || z.end || '– (см. карточку)'}** · размещено ${z.pub}`);
    lines.push(`- Обеспечение заявки: ${ob} · обеспечение контракта: ${/да/i.test(c.obespK || '') ? (c.obespKsum || 'да') : (c.obespK ? 'нет' : '–')}`);
    if (c.smp) lines.push('- Только для малого бизнеса (СМП) – самозанятые и ИП подходят');
    if (c.srok) lines.push(`- Срок исполнения: ${c.srok}`);
    lines.push(`- Закупка: ${z.url}`, `- Разобрать: «разбери закупку ${z.num}»`, '');
  });
  const out = path.join(papka, `госзакупки-${date.split('.').reverse().join('-')}.md`);
  fs.writeFileSync(out, lines.join('\n'));
  fs.writeFileSync(path.join(papka, 'последний-поиск.json'), JSON.stringify(found, null, 2));
  console.log(lines.join('\n'));
  ok(`отчёт → ${out}`);
} else if (cmd === 'rynok') {
  // что покупали за N дней (все этапы): начальная цена → цена контракта, сколько заявок
  const days = +arg('--days', 90), max = +arg('--max', 3000000);
  const from = ddmmyyyy(new Date(Date.now() - days * 864e5));
  const papka = path.resolve(arg('--papka', path.join(process.cwd(), 'госзакупки')));
  fs.mkdirSync(papka, { recursive: true });
  const seen = new Map();
  for (const q of ['создание сайта', 'разработка сайта', 'разработка официального сайта', 'создание веб-сайта', 'сайт-лендинг']) {
    for (let p = 1; p <= 2; p++) {
      const u = `/epz/order/extendedsearch/results.html?searchString=${encodeURIComponent(q)}&morphology=on&fz44=on&fz223=on&af=on&ca=on&pc=on&pa=on&publishDateFrom=${from}&sortBy=PUBLISH_DATE&sortDirection=false&recordsPerPage=_50&pageNumber=${p}&priceToGeneral=${max}`;
      let list; try { list = parseList(await get(u)); } catch { break; }
      for (const z of list) if (z.num && !seen.has(z.num)) seen.set(z.num, z);
      if (list.length < 50) break; await sleep(600);
    }
  }
  const found = [...seen.values()].filter((z) => MAKE.test(z.obj) && !SKIP.test(z.obj));
  for (const z of found) {
    if (!/44-ФЗ|Электронный аукцион|Запрос котировок|Конкурс/i.test(z.law) || !z.url.includes('regNumber')) continue;
    try {
      const s = await get(z.url.replace('common-info', 'supplier-results'));
      const rows = [...s.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => txt(c[1])));
      const bids = rows.filter((r) => r.length >= 3 && /^\d{6,10}$/.test(r[0]) && /\d/.test(r[2] || ''));
      const nums = bids.map((r) => +((r[1].match(/^(\d+)/) || [])[1] || 0));
      const contract = rows.find((r) => r.length >= 4 && /^\d{15,}$/.test(r[0]));
      z.itog = contract ? rub(contract[3]) : (bids.find((r) => /Победитель/.test(r[1])) ? rub(bids.find((r) => /Победитель/.test(r[1]))[2]) : 0);
      z.zayavok = nums.length && Math.max(...nums, bids.length) > 1 ? Math.max(...nums, bids.length) : 0;
      z.pobeditel = contract ? contract[2] : '';
    } catch {}
    await sleep(500);
  }
  found.sort((a, b) => (b.pub.split('.').reverse().join('')).localeCompare(a.pub.split('.').reverse().join('')));
  const lines = [`# Рынок госзакупок сайтов · последние ${days} дн.`, '', `Источник – ЕИС zakupki.gov.ru, закупки на создание / разработку сайта до ${fmt(max)}. Найдено: ${found.length}.`, '', '| Размещено | Что купили | Начальная цена | Итог (контракт) | Заявок | Этап |', '|---|---|---|---|---|---|'];
  for (const z of found) lines.push(`| ${z.pub} | ${z.obj.slice(0, 80)} | ${fmt(z.price)} | ${z.itog ? fmt(z.itog) : '–'} | ${z.zayavok || '–'} | ${z.etap} |`);
  const out = path.join(papka, `рынок-${ddmmyyyy(new Date()).split('.').reverse().join('-')}.md`);
  fs.writeFileSync(out, lines.join('\n'));
  console.log(lines.join('\n'));
  ok(`отчёт → ${out}`);
} else if (cmd === 'razbor') {
  const num = (rest[0] || '').replace(/\D/g, ''); if (!num) fail('укажи номер закупки: razbor 0372200172326000015');
  const papka = path.resolve(arg('--papka', path.join(process.cwd(), 'госзакупки')), num);
  fs.mkdirSync(papka, { recursive: true });
  const list = parseList(await get(`/epz/order/extendedsearch/results.html?searchString=${num}&fz44=on&fz223=on&af=on&ca=on&pc=on&pa=on`));
  const z = list.find((x) => x.num === num) || list[0]; if (!z || !z.url) fail('закупка не найдена в ЕИС – проверь номер');
  const c = await card(z.url);
  const docsUrl = z.url.replace('common-info', 'documents');
  const ds = await get(docsUrl);
  const docs = [...ds.matchAll(/href="(https:\/\/zakupki\.gov\.ru\/[^"]*download[^"]*)"[^>]*title="([^"]+)"/g)].map((m) => ({ url: m[1].replace(/&amp;/g, '&'), name: m[2].trim() }));
  const uniq = []; for (const d of docs) if (!uniq.find((u) => u.url === d.url)) uniq.push(d);
  const got = [];
  for (const d of uniq.slice(0, 15)) {
    const safe = d.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
    const fpath = path.join(papka, safe);
    try {
      const r = await fetch(d.url, { headers: UA, signal: AbortSignal.timeout(60000) });
      fs.writeFileSync(fpath, Buffer.from(await r.arrayBuffer()));
      let note = '';
      if (/\.docx$/i.test(safe)) {
        try { const xml = execFileSync('unzip', ['-p', fpath, 'word/document.xml'], { maxBuffer: 50e6 }).toString('utf8'); fs.writeFileSync(fpath + '.txt', xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n')); note = ' → .txt'; }
        catch { try { execFileSync('powershell', ['-NoProfile', '-Command', `Add-Type -A System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('${fpath}'); $e=$z.GetEntry('word/document.xml'); $s=New-Object IO.StreamReader($e.Open()); $x=$s.ReadToEnd(); $z.Dispose(); [IO.File]::WriteAllText('${fpath}.txt', ($x -replace '</w:p>',"\`n" -replace '<[^>]+>',''))`]); note = ' → .txt'; } catch { note = ' (docx не распакован – прочитай файл сам)'; } }
      }
      got.push(`${safe}${note}`);
    } catch { got.push(`${safe} – не скачался`); }
    await sleep(300);
  }
  let itog = '';
  if (/заверш/i.test(z.etap) && z.url.includes('regNumber')) {
    try {
      const s = await get(z.url.replace('common-info', 'supplier-results'));
      const rows = [...s.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => txt(c[1])));
      const bids = rows.filter((r) => r.length >= 3 && /^\d{6,10}$/.test(r[0]) && /\d/.test(r[2] || ''));
      const contract = rows.find((r) => r.length >= 4 && /^\d{15,}$/.test(r[0]));
      itog = `- Итоги: ${contract ? `контракт с ${contract[2]} за ${fmt(rub(contract[3]))}` : 'контракт ещё не опубликован'}; предложения участников: ${bids.map((r) => fmt(rub(r[2])) + (/Победитель/.test(r[1]) ? ' (победитель)' : '')).join(', ') || '–'}; наибольший номер заявки: ${Math.max(0, ...bids.map((r) => +((r[1].match(/^(\d+)/) || [])[1] || 0))) || '–'}`;
    } catch {}
  }
  const lines = [`# Закупка ${num}`, '', `${z.obj}`, '', ...(itog ? [itog] : []), `- Заказчик: ${z.cust}${c.region ? ' · ' + c.region : ''}`, `- Начальная цена: ${fmt(z.price)} · ${z.law} · этап: ${z.etap}`, `- Подача заявок до: ${c.end || z.end || '–'}`, `- Обеспечение заявки: ${c.obespZ || '–'} ${c.obespZsum || ''}`, `- Обеспечение контракта: ${c.obespK || '–'} ${c.obespKsum || ''}`, `- Срок исполнения: ${c.srok || '–'}`, `- Площадка: ${c.ploshadka || '–'}`, `- Только малый бизнес: ${c.smp || 'не указано'}`, `- Карточка: ${z.url}`, '', '## Документы', ...got.map((g) => '- ' + g), '', '## Все поля карточки', ...Object.entries(c.f).filter(([k, v]) => v && v.length < 600).map(([k, v]) => `- ${k}: ${v}`)];
  fs.writeFileSync(path.join(papka, 'карточка.md'), lines.join('\n'));
  console.log(lines.slice(0, 16 + got.length).join('\n'));
  ok(`карточка и документы → ${papka} (дальше прочитай описание объекта закупки и проект контракта)`);
} else if (cmd === 'bot') {
  const file = rest[0]; if (!file || !fs.existsSync(file)) fail('нужен файл отчёта');
  let dir = arg('--bot-dir');
  if (!dir) { try { dir = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.vibe', 'radar', 'config.json'), 'utf8')).bot; } catch {} }
  if (!dir) fail('бот не подключён: укажи --bot-dir "<папка бота>"');
  const env = {}; for (const l of fs.readFileSync(path.join(dir, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
  const owner = JSON.parse(fs.readFileSync(path.join(dir, 'bot.json'), 'utf8')).ownerChatId;
  if (!env.BOT_TOKEN || !owner) fail('у бота нет токена или чата владельца');
  const text = fs.readFileSync(file, 'utf8').replace(/^#+ /gm, '').replace(/\*\*/g, '').trim();
  const parts = []; let cur = '';
  for (const b of text.split(/\n{2,}/)) { if ((cur + '\n\n' + b).length > 3900) { if (cur) parts.push(cur); cur = b.slice(0, 3900); } else cur = cur ? cur + '\n\n' + b : b; }
  if (cur) parts.push(cur);
  for (const p of parts) { const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: owner, text: p, disable_web_page_preview: true }) }); const j = await r.json(); if (!j.ok) fail('Telegram: ' + j.description); }
  ok(`отчёт отправлен ботом (${parts.length} сообщ.)`);
} else {
  console.log('команды: poisk [--days 7] [--max 1000000] | razbor <номер> | bot "<файл>"');
}
