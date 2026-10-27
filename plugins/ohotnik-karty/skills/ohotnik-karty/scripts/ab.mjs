#!/usr/bin/env node
// А/Б-тест заходов: два варианта первого сообщения, считаем ответы по каждому.
// node ab.mjs on    "<папка охоты>"            – разметить, кому какой заход (только тем, кому ещё не писали): чётные №–Б, нечётные–А
// node ab.mjs need  "<папка охоты>"            – список №, которым нужен текст захода Б (Клод пишет его по описанию из base.заходы.Б)
// node ab.mjs set   "<папка охоты>" <№> "<текст>" – записать текст первого сообщения (с {{ссылка на демо}} или готовой ссылкой)
// node ab.mjs stats "<папка охот>"             – отправлено и ответили по заходам во всех охотах (для «итогов недели» и «какой заход лучше?»)
import fs from 'node:fs';
import path from 'node:path';

const [cmd, dir, ...rest] = process.argv.slice(2);
const REPLY = ['ответил', 'оплатил', 'отказ']; // любой ответ владельца – заход сработал (даже «нет, спасибо»)
const load = (d) => { const f = path.join(path.resolve(d), 'база.json'); return { f, base: JSON.parse(fs.readFileSync(f, 'utf8')) }; };
const save = (f, base) => fs.writeFileSync(f, JSON.stringify(base, null, 2));
const sent = (b) => !!((b.touches && b.touches.t1) || (b.status && b.status !== 'новый'));

if (!cmd || !dir) { console.log('команды: on | need | set | stats'); process.exit(0); }

if (cmd === 'on') {
  const { f, base } = load(dir);
  base.заходы = base.заходы || {
    А: { name: 'Крючок из отзыва', how: 'как сейчас: цитата из отзыва → зачем сайт → ссылка на демо → один вопрос' },
    Б: { name: 'Коротко и сразу демо', how: '2–3 предложения: кто пишет, «собрал для вас демо-сайт по вашей карточке на Картах» + ссылка, один вопрос «как вам?». Без цитаты' },
  };
  let a = 0, b2 = 0;
  for (const b of base.бизнесы || []) {
    if (sent(b) || b.siteVerdict === 'живой' || !b.message) continue;
    if (!b.variant) b.variant = (+b['№'] % 2 === 0) ? 'Б' : 'А';
    if (b.variant === 'А') a++; else b2++;
  }
  base.abSince = base.abSince || new Date().toISOString().slice(0, 10);
  save(f, base);
  console.log(`✓ А/Б-тест включён: заход А «${base.заходы.А.name}» – ${a}, заход Б «${base.заходы.Б.name}» – ${b2} (тем, кому уже писали, ничего не меняли)`);
  console.log('  дальше: тексты захода Б – «ab.mjs need», Клод пишет их по описанию и сохраняет «ab.mjs set»');
} else if (cmd === 'need') {
  const { base } = load(dir);
  const need = (base.бизнесы || []).filter((b) => b.variant === 'Б' && !sent(b) && !b.messageB);
  console.log(JSON.stringify({ how: base.заходы?.Б, need: need.map((b) => ({ n: b['№'], name: b.name, demoUrl: b.demoUrl || null, hook: b.hook?.quote || null })) }, null, 2));
} else if (cmd === 'set') {
  const { f, base } = load(dir); const n = +rest[0], text = rest.slice(1).join(' ');
  const b = (base.бизнесы || []).find((x) => +x['№'] === n);
  if (!b || !text) { console.error('✗ нужен № и текст'); process.exit(1); }
  if (sent(b)) { console.error(`✗ №${n} уже написали – текст не меняю`); process.exit(1); }
  if (!b.messageA) b.messageA = b.message; // исходный текст захода А сохраняем
  b.message = b.demoUrl ? text.replace(/\{\{ссылка на демо\}\}/g, b.demoUrl) : text; b.messageB = true;
  save(f, base); console.log(`✓ №${n}: текст захода ${b.variant || '?'} записан`);
} else if (cmd === 'stats') {
  const root = path.resolve(dir); const by = {};
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue; const bp = path.join(root, e.name, 'база.json'); if (!fs.existsSync(bp)) continue;
    let base; try { base = JSON.parse(fs.readFileSync(bp, 'utf8')); } catch { continue; }
    for (const b of base.бизнесы || []) {
      if (!b.variant || !sent(b)) continue;
      const k = b.variant, nm = base.заходы?.[k]?.name || '';
      by[k] = by[k] || { name: nm, sent: 0, replied: 0, paid: 0 };
      by[k].sent++; if (REPLY.includes(b.status)) by[k].replied++; if (b.status === 'оплатил') by[k].paid++;
    }
  }
  const keys = Object.keys(by).sort();
  if (!keys.length) { console.log('А/Б-теста ещё нет или первые сообщения по заходам не отправлялись: «включи А/Б-тест»'); process.exit(0); }
  for (const k of keys) { const x = by[k]; console.log(`Заход ${k}${x.name ? ' «' + x.name + '»' : ''}: отправлено ${x.sent}, ответили ${x.replied} (${x.sent ? Math.round(x.replied / x.sent * 100) : 0} %), оплатили ${x.paid}`); }
  const small = keys.some((k) => by[k].sent < 20);
  if (small) console.log('○ пока меньше 20 отправок в каком-то заходе – выводы рано, продолжайте оба');
  else if (keys.length === 2) { const [a, b] = keys.map((k) => by[k].replied / by[k].sent); const win = a >= b ? keys[0] : keys[1]; console.log(`→ лучше отвечают на заход ${win}. Слабый – «докрути заходы»`); }
}
