#!/usr/bin/env node
// Радар заказов: прямые заказчики из Telegram-каналов + Kwork → утренняя сводка от бота ученика.
//   node radar.mjs init --vitrina <ссылка> --bot "<папка бота>"   – запомнить витрину и бота (~/.vibe/radar/config.json)
//   node radar.mjs frazy [--n 5]                                  – фразы для глобального поиска по постам (у каждого свои)
//   node radar.mjs ocenka <канал> [<канал> …]                     – оценить каналы: живой? зеркало биржи? сколько прямых заказов на сайты
//   node radar.mjs ocenka --file posts.json                       – то же для группы, посты которой Клод прочитал в Telegram Web
//   node radar.mjs kanaly [list | add <канал…> | remove <канал…>] – «мои каналы»
//   node radar.mjs sbor [--hours 24] [--import posts.json]        – собрать новые прямые заказы из моих каналов → ~/.vibe/radar/sbor.json
//   node radar.mjs kwork                                          – свежая лента Kwork (скилл «Подборка заказов») → ~/.vibe/radar/kwork-lenta.txt
//   node radar.mjs svodka "<файл сводки .md>"                     – отправить сводку ученику через его бота (и сохранить в журнал)
//   node radar.mjs check                                          – проверка: витрина, бот, каналы
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const HOME = os.homedir();
const DIR = path.join(HOME, '.vibe', 'radar');
fs.mkdirSync(DIR, { recursive: true });
const F = (n) => path.join(DIR, n);
const readJ = (n, d) => { try { return JSON.parse(fs.readFileSync(F(n), 'utf8')); } catch { return d; } };
const writeJ = (n, v) => fs.writeFileSync(F(n), JSON.stringify(v, null, 2));
const ok = (s) => console.log('✓ ' + s), info = (s) => console.log('○ ' + s);
const fail = (s) => { console.error('✗ ' + s); process.exit(1); };
const tilde = (p) => (p ? p.replace(/^~(?=[\\/])/, HOME) : p);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const [cmd, ...rest] = process.argv.slice(2);
const norm = (c) => String(c || '').trim().replace(/^https?:\/\/t\.me\/(s\/)?/i, '').replace(/^@/, '').replace(/[/?].*$/, '');

// ---------- классификатор постов ----------
const SITE = /(сайт|лендинг|landing|одностранич|тильд|tilda|сайт-визитк|посадочн)/i;
const ASK = /(ищу|ищем|нуж(ен|на|но|ны)|требуется|кто (может|сможет|сделает|возьм)|есть (ли )?(кто|ребята|специалист)|подскажите (кто|специалиста)|посоветуйте|заказ(ать)?|хочу (сделать|заказать)|сделать сайт|создать сайт)/i;
const CONTACT = /(@[a-z0-9_]{4,}|t\.me\/[a-z0-9_]{4,}|в лс|в личк|личные сообщения|пишите|писать|\+7[\d\s()-]{9,}|\b8[\s(-]?9\d{2})/i;
const MIRROR = /(https?:\/\/\S+\/(project\/\S+\/)?\d{6,8}\b|intwork\.top|kwork\.ru|fl\.ru|freelancehunt|freelance\.ru|weblancer|youdo\.com|profi\.ru|habr\.com\/ru\/freelance|желаемый бюджет|допустимый:|№\s?\d{6,}|категория:|раздел:|заказы на fl)/i;
// не наш уровень или не заказ сайта с нуля
const NOT = /(правк|доработ|доделать|перенос|seo|продвижен|парсинг|бот[ау]?\b|чат-бот|битрикс|bitrix|wordpress|\bwp\b|1с|1c|интеграц|приложени|верстальщик|frontend|backend|react|vue|next\.?js|django|laravel|php|вакансия|#вакансия|в штат|зарплат|оклад|полная занятость|резюме|#резюме|ищу работу|smm|таргет|директ|копирайт|дизайнер интерфейс|в команду|в нашу команду|в команде|требования:|обязанности:|условия:|мы в [A-ZА-ЯЁ]|web designer|ui\/ux|ux\/ui|мы\s+[–—-]|задачи:|ищут|подборка|агентств|студент|семестр|маркетолог|редактор|оператор|figma|фигм|графическ|презентаци)/i;
// исполнители рекламируют себя – это не заказ
const SELLER = /(сделаю (вам )?сайт|создаю сайты|делаю сайты|разрабатываю сайты|предлагаю услуг|мои услуги|портфолио|обращайтесь|возьмусь|выполню|беру заказы|наша студия|веб-студия .* предлагает|скидка на (создание|разработку)|есть третий вариант|отдайте задачу|мы созда[её]м|мы делаем|прайс|скидк|акция|примеры (готовых |моих )?работ|для связи|пополняет портфолио|студия (современной )?разработки)/i;

// прямой заказ: короткий живой пост, просьба в начале, есть контакт
export function kontakt(t) {
  const at = t.match(/@[A-Za-z0-9_]{4,}/g); if (at) return at[at.length - 1];
  const tm = t.match(/t\.me\/[A-Za-z0-9_]{4,}/); if (tm) return 'https://' + tm[0];
  const ph = t.match(/(\+7|\b8)[\s(-]?\d{3}[\s)-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/); if (ph) return ph[0];
  return '';
}

export function klass(t) {
  const head = t.slice(0, 600);
  if (MIRROR.test(t)) return 'зеркало';
  if (SELLER.test(head)) return 'исполнитель';
  if (!SITE.test(head)) return 'другое';
  if (NOT.test(head)) return 'не наш';
  if (ASK.test(t.slice(0, 250)) && t.length < 1200) return CONTACT.test(t) ? 'прямой' : 'прямой?';
  return 'другое';
}

// ---------- чтение публичного канала с t.me (без входа) ----------
const strip = (h) => h.replace(/<br\s*\/?>/g, '\n').replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (m, u, x) => (/^@|t\.me/.test(x) ? x : x + (u.startsWith('http') && !x.includes(u) ? ' ' + u : '')))
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/[ \t]+/g, ' ').trim();
async function page(c, before) {
  const u = `https://t.me/s/${c}${before ? '?before=' + before : ''}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'Mozilla/5.0' } });
  const s = await r.text();
  const title = (s.match(/<meta property="og:title" content="([^"]*)"/) || [])[1] || c;
  const blocks = s.split('<div class="tgme_widget_message_wrap').slice(1);
  const posts = blocks.map((b) => {
    const id = +((b.match(/data-post="[^/]+\/(\d+)"/) || [])[1] || 0);
    const d = (b.match(/datetime="([^"]*)"/) || [])[1];
    const t = strip((b.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '');
    const author = strip((b.match(/tgme_widget_message_from_author[^>]*>([\s\S]*?)<\/(span|a)>/) || [])[1] || '');
    return { id, d, t, author };
  }).filter((p) => p.id);
  return { title, posts, feed: s.includes('tgme_widget_message_wrap'), group: /members/.test(s) && !s.includes('tgme_channel_info_counter') };
}
async function readChannel(c, { hours = 24, sinceId = 0, maxPages = 6 } = {}) {
  let all = [], before, title = c, feed = false;
  const edge = Date.now() - hours * 3600e3;
  for (let i = 0; i < maxPages; i++) {
    const p = await page(c, before); title = p.title; feed = feed || p.feed;
    if (!p.posts.length) break;
    all = p.posts.concat(all);
    const oldest = p.posts[0];
    if (oldest.id <= sinceId || (oldest.d && Date.parse(oldest.d) < edge)) break;
    before = oldest.id;
  }
  all = all.filter((p) => p.id > sinceId && (!p.d || Date.parse(p.d) >= edge));
  const seen = new Set(); all = all.filter((p) => !seen.has(p.id) && seen.add(p.id));
  return { title, feed, posts: all };
}
const ageH = (d) => (d ? Math.round((Date.now() - Date.parse(d)) / 36e5) : null);

function verdict(posts) {
  const k = posts.map((p) => klass(p.t));
  const n = posts.length, mirror = k.filter((x) => x === 'зеркало').length;
  const direct = k.filter((x) => x === 'прямой').length;
  const last = posts.at(-1)?.d;
  let v;
  if (!n) v = 'нет постов';
  else if (ageH(last) > 24 * 7) v = 'мёртвый';
  else if (mirror / n >= 0.4) v = 'зеркало биржи';
  else if (direct >= 1) v = 'годен';
  else v = 'нет заказов на сайты';
  return { v, n, mirror, direct, last: last?.slice(0, 16).replace('T', ' ') };
}

// ---------- команды ----------
if (cmd === 'init') {
  const cfg = readJ('config.json', {});
  const v = arg('--vitrina'), b = arg('--bot');
  if (v) cfg.vitrina = v;
  if (b) { const d = path.resolve(b); if (!fs.existsSync(path.join(d, '.env'))) fail(`в папке ${d} нет бота (.env)`); cfg.bot = d; }
  writeJ('config.json', cfg); ok(`радар: витрина ${cfg.vitrina || '–'}, бот ${cfg.bot || '–'}`);
} else if (cmd === 'frazy') {
  const ALL = ['ищу разработчика сайта', 'нужен сайт', 'кто сделает сайт', 'нужен лендинг', 'сделать сайт на тильде', 'ищу кто сделает лендинг', 'нужен сайт-визитка', 'требуется создать сайт', 'ищу веб-дизайнера сайт', 'нужен одностраничник', 'кто может сделать сайт', 'заказать сайт недорого', 'ищу тильдолога', 'нужен сайт для бизнеса', 'посоветуйте кто делает сайты', 'нужна посадочная страница', 'ищу исполнителя сайт', 'нужно сделать сайт срочно'];
  const used = readJ('frazy.json', []);
  const n = +arg('--n', 5);
  let pool = ALL.filter((f) => !used.includes(f)); if (pool.length < n) pool = ALL.slice();
  const pick = pool.sort(() => Math.random() - 0.5).slice(0, n);
  writeJ('frazy.json', [...new Set([...used, ...pick])].slice(-ALL.length + 1));
  console.log(pick.join('\n'));
} else if (cmd === 'ocenka') {
  const file = tilde(arg('--file'));
  if (file) {
    // файл от vibeRadar.prochitat: [{channel, title, group, n, mirror, last, posts:[{id,d,t,author}]}]
    const arr = [].concat(JSON.parse(fs.readFileSync(file, 'utf8')));
    const res = arr.map((g) => {
      if (g.error) return { c: g.channel, v: 'не открылся' };
      const r = verdict(g.posts || []);
      const n = g.n ?? r.n, mirror = g.mirror ?? r.mirror, last = (g.last || '').slice(0, 16).replace('T', ' ') || r.last;
      let v = r.v;
      if (!n) v = 'нет постов';
      else if (last && ageH(last) > 24 * 7) v = 'мёртвый';
      else if (mirror / n >= 0.4) v = 'зеркало биржи';
      else v = r.direct >= 1 ? 'годен' : 'нет заказов на сайты';
      return { c: g.channel, title: g.title, group: g.group, v, n, mirror, direct: r.direct, last, ex: (g.posts || []).filter((p) => klass(p.t) === 'прямой').slice(-2) };
    });
    res.sort((a, b) => (a.v === 'годен' ? 0 : 1) - (b.v === 'годен' ? 0 : 1) || (b.direct || 0) - (a.direct || 0));
    for (const r of res) {
      console.log(`@${r.c} «${r.title || ''}»${r.group ? ' (группа)' : ''}: ${r.v}${r.n != null ? ` – постов ${r.n}, зеркальных ${r.mirror}, прямых заказов на сайты ${r.direct}, последний ${r.last || '–'}` : ''}`);
      for (const p of r.ex || []) console.log(`    · ${p.d?.slice(5, 16).replace('T', ' ')} ${p.t.replace(/\s+/g, ' ').slice(0, 140)}`);
    }
    // подсказка без @: в PowerShell «@имя» – это splatting, имя пропадает
    const good = res.filter((r) => r.v === 'годен' && !r.group).map((r) => r.c);
    const goodG = res.filter((r) => r.v === 'годен' && r.group).map((r) => r.c);
    if (good.length) console.log(`\nгодных каналов: ${good.length} → kanaly add ${good.join(' ')}`);
    if (goodG.length) console.log(`годных групп: ${goodG.length} → kanaly add ${goodG.join(' ')} --group`);
  } else {
    const list = rest.filter((x) => !x.startsWith('--')).map(norm).filter(Boolean);
    if (!list.length) fail('укажи каналы: ocenka @канал1 @канал2');
    const out = await Promise.all(list.map(async (c) => {
      try { const { title, feed, posts } = await readChannel(c, { hours: 24 * 14, maxPages: 3 }); if (!feed) return { c, title, v: 'группа или закрыт – читать в Telegram Web' }; return { c, title, ...verdict(posts), ex: posts.filter((p) => /прямой/.test(klass(p.t))).slice(-2) }; }
      catch (e) { return { c, v: 'не открылся' }; }
    }));
    const order = { 'годен': 0, 'группа или закрыт – читать в Telegram Web': 1 };
    out.sort((a, b) => (order[a.v] ?? 9) - (order[b.v] ?? 9) || (b.direct || 0) - (a.direct || 0));
    for (const r of out) {
      console.log(`@${r.c} «${r.title || ''}»: ${r.v}${r.n != null ? ` – постов за 2 нед. ${r.n}, зеркальных ${r.mirror}, прямых заказов на сайты ${r.direct}, последний ${r.last || '–'}` : ''}`);
      for (const p of r.ex || []) console.log(`    · ${p.d?.slice(5, 16).replace('T', ' ')} ${p.t.replace(/\s+/g, ' ').slice(0, 140)}`);
    }
  }
} else if (cmd === 'kanaly') {
  // флаги (--group) – не каналы; записи вида «--group» от версии 1.0.0 убираем сами
  const k = readJ('kanaly.json', []).filter((y) => y.c && !y.c.startsWith('-')); const [sub, ...args] = rest;
  const xs = args.filter((x) => !String(x).startsWith('-')).map(norm).filter(Boolean);
  if ((sub === 'add' || sub === 'remove') && !xs.length) fail(`укажи каналы: kanaly ${sub} канал1 канал2 (в PowerShell без @ или в кавычках: '@канал' – иначе PowerShell съест имя)`);
  if (sub === 'add') { const isGroup = process.argv.includes('--group'); const added = []; for (const x of xs) if (!k.find((y) => y.c.toLowerCase() === x.toLowerCase())) { k.push({ c: x, added: new Date().toISOString().slice(0, 10), group: isGroup }); added.push('@' + x); } writeJ('kanaly.json', k); ok(`добавлено: ${added.join(' ') || 'ничего нового'}${isGroup && added.length ? ' (группы)' : ''} · в моих каналах ${k.length}`); }
  else if (sub === 'remove') { const rm = xs.map((x) => x.toLowerCase()); const k2 = k.filter((y) => !rm.includes(y.c.toLowerCase())); writeJ('kanaly.json', k2); ok(`убрано: ${k.length - k2.length} · в моих каналах ${k2.length}`); }
  else { if (!k.length) info('моих каналов пока нет: «найди мне каналы с заказами»'); k.forEach((y, i) => console.log(`${i + 1}. @${y.c}${y.group ? ' (группа – читать в Telegram Web)' : ''} · с ${y.added}`)); }
} else if (cmd === 'sbor') {
  const k = readJ('kanaly.json', []); const seen = readJ('seen.json', {});
  const hours = +arg('--hours', 24); const imp = tilde(arg('--import'));
  const found = [], stat = [];
  for (const y of k.filter((y) => !y.group)) {
    try {
      const { title, posts } = await readChannel(y.c, { hours, sinceId: seen[y.c] || 0 });
      let n = 0;
      for (const p of posts) { const kl = klass(p.t); if (kl === 'прямой' || kl === 'прямой?') { found.push({ kanal: '@' + y.c, title, url: `https://t.me/${y.c}/${p.id}`, d: p.d, contact: kontakt(p.t) || (p.author ? 'автор: ' + p.author : 'в посте нет – писать через комментарии/канал'), t: p.t.slice(0, 1500), uverenno: kl === 'прямой' }); n++; } }
      if (posts.length) seen[y.c] = Math.max(seen[y.c] || 0, ...posts.map((p) => p.id));
      stat.push(`@${y.c}: новых постов ${posts.length}, прямых заказов ${n}`);
    } catch { stat.push(`@${y.c}: не открылся`); }
  }
  if (imp) { // группы, прочитанные Клодом в Telegram Web: [{channel, posts:[{t,d,id,author}]}]
    for (const g of JSON.parse(fs.readFileSync(imp, 'utf8'))) {
      if (g.error) { stat.push(`@${norm(g.channel)}: не открылся`); continue; }
      let n = 0; const last = +(seen[g.channel] || 0);
      for (const p of g.posts || []) { if (p.id && p.id <= last) continue; if (p.d && Date.parse(p.d) < Date.now() - hours * 3600e3) continue; const kl = klass(p.t); if (kl === 'прямой' || kl === 'прямой?') { found.push({ kanal: '@' + norm(g.channel), title: g.title || g.channel, url: p.id ? `https://t.me/${norm(g.channel)}/${p.id}` : `https://t.me/${norm(g.channel)}`, d: p.d, contact: kontakt(p.t) || (p.author ? 'автор: ' + p.author : 'автор сообщения в группе'), t: p.t.slice(0, 1500), uverenno: kl === 'прямой' }); n++; } }
      const ids = (g.posts || []).map((p) => +p.id || 0); if (ids.length) seen[g.channel] = Math.max(last, ...ids);
      stat.push(`@${norm(g.channel)}${g.group ? ' (группа)' : ''}: постов про сайты ${(g.posts || []).length}, прямых заказов ${n}`);
    }
  }
  // повторы одного и того же объявления в разных каналах – одно
  const uniq = []; for (const f of found) { const key = f.t.replace(/\s+/g, ' ').slice(0, 120).toLowerCase(); if (!uniq.find((u) => u._k === key)) uniq.push({ ...f, _k: key }); }
  uniq.forEach((u) => delete u._k);
  writeJ('seen.json', seen);
  writeJ('sbor.json', { at: new Date().toISOString(), tg: uniq });
  stat.forEach((s) => console.log('  ' + s));
  ok(`Telegram: прямых заказов на сайты ${uniq.length} → ${F('sbor.json')}`);
  if (!k.length) info('моих каналов нет: «найди мне каналы с заказами»');
} else if (cmd === 'kwork') {
  const base = path.join(HOME, '.claude', 'plugins');
  const cands = [];
  const walk = (d, depth) => { if (depth > 7) return; let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, depth + 1); else if (e.name === 'fetch-lenta.js' && p.includes('kwork-podborka')) cands.push(p); } };
  walk(base, 0);
  const extra = arg('--script'); if (extra) cands.unshift(extra);
  if (!cands.length) fail('не нашёл скилл «Подборка заказов на Kwork» – включите kwork-podborka');
  const out = F('kwork-lenta.txt');
  execFileSync(process.execPath, [cands[0], '--c', '37', '--keyword', 'сайт', '--max-age', arg('--max-age', '24'), '--out', out], { stdio: 'inherit' });
  ok(`лента Kwork → ${out} (дальше – фильтр и отклики по правилам скилла «Подборка заказов»)`);
} else if (cmd === 'svodka') {
  const cfg = readJ('config.json', {}); const file = tilde(rest[0]);
  if (!file || !fs.existsSync(file)) fail('нужен файл сводки: svodka "<файл.md>"');
  if (!cfg.bot) fail('бот не подключён к радару: init --bot "<папка бота>"');
  const env = {}; for (const l of fs.readFileSync(path.join(cfg.bot, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
  const bot = JSON.parse(fs.readFileSync(path.join(cfg.bot, 'bot.json'), 'utf8'));
  if (!env.BOT_TOKEN) fail('в папке бота нет токена'); if (!bot.ownerChatId) fail('бот не знает чат владельца: «запомни мой чат»');
  const text = fs.readFileSync(file, 'utf8').trim();
  // режем по блокам, каждое сообщение до 3900 символов
  const parts = []; let cur = '';
  for (const block of text.split(/\n{2,}/)) { if ((cur + '\n\n' + block).length > 3900) { if (cur) parts.push(cur); cur = block.slice(0, 3900); } else cur = cur ? cur + '\n\n' + block : block; }
  if (cur) parts.push(cur);
  for (const p of parts) {
    const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: bot.ownerChatId, text: p, disable_web_page_preview: true }) });
    const j = await r.json(); if (!j.ok) fail('Telegram не принял сообщение: ' + (j.description || r.status));
  }
  const log = path.join(DIR, 'svodki'); fs.mkdirSync(log, { recursive: true });
  fs.copyFileSync(file, path.join(log, new Date().toISOString().slice(0, 10) + '.md'));
  ok(`сводка отправлена ботом (${parts.length} сообщ.)`);
} else if (cmd === 'check') {
  const cfg = readJ('config.json', {}); const k = readJ('kanaly.json', []);
  console.log(`витрина: ${cfg.vitrina || '– (скажи адрес витрины)'}`);
  if (cfg.bot) { const has = fs.existsSync(path.join(cfg.bot, '.env')); let own = ''; try { own = JSON.parse(fs.readFileSync(path.join(cfg.bot, 'bot.json'), 'utf8')).ownerChatId; } catch {} console.log(`бот: ${cfg.bot} – токен ${has ? 'есть' : 'НЕТ'}, чат владельца ${own ? 'есть' : 'НЕТ («запомни мой чат»)'}`); }
  else console.log('бот: – (init --bot "<папка бота>")');
  console.log(`моих каналов: ${k.length}`);
} else {
  console.log('команды: init | frazy | ocenka | kanaly | sbor | kwork | svodka | check');
}
