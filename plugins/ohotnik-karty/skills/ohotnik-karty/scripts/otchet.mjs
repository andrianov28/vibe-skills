#!/usr/bin/env node
// Охотник: сборка отчёта «Карта охоты» из база.json → отчёт.html + база.csv (в той же папке).
// node otchet.mjs "<папка охоты>"                      – пересобрать отчёт
// node otchet.mjs "<папка охоты>" --demo <№> <ссылка>  – записать ссылку на демо-сайт бизнесу №N и пересобрать
// node otchet.mjs "<папка охоты>" --status <№> <статус> – поставить статус (новый|написал|ответил|оплатил)
// Без зависимостей. Индекс горячести считается здесь, чтобы у всех учеников он был одинаковым.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dir = path.resolve(args[0] || '.');
const basePath = path.join(dir, 'база.json');
if (!fs.existsSync(basePath)) { console.error('Нет файла база.json в папке ' + dir); process.exit(1); }
const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
base.бизнесы = base.бизнесы || [];

// ---- правки из командной строки
const iDemo = args.indexOf('--demo');
if (iDemo > -1) {
  const n = +args[iDemo + 1], url = args[iDemo + 2];
  const b = base.бизнесы[n - 1];
  if (!b) { console.error('Нет бизнеса №' + n); process.exit(1); }
  b.demoUrl = url; b.demoAt = today();
  if (b.message) b.message = b.message.replace(/\{\{ссылка на демо\}\}/g, url);
}
const iSt = args.indexOf('--status');
if (iSt > -1) {
  const n = +args[iSt + 1], st = args[iSt + 2];
  const b = base.бизнесы[n - 1];
  if (!b) { console.error('Нет бизнеса №' + n); process.exit(1); }
  b.status = st; b.statusAt = today();
}

// ---- индекс горячести
function num(x) { if (x == null) return null; const s = String(x).replace(',', '.').replace(/[^\d.]/g, ''); return s ? parseFloat(s) : null; }
function writeChannels(b) {
  const ch = [];
  for (const s of b.socials || []) {
    const k = (s.kind || '').toLowerCase();
    // t.me/+7… и wa.me/7… – ссылки по номеру телефона (Карты делают их сами), настоящий ли там аккаунт – неизвестно
    if (/telegram/.test(k)) ch.push({ label: /t\.me\/\+?\d{10,}/.test(s.url) ? 'Телеграм по номеру' : 'Телеграм', url: s.url, primary: true });
    else if (/whatsapp/.test(k)) ch.push({ label: 'WhatsApp по номеру', url: s.url, primary: true });
    else if (/max/.test(k)) ch.push({ label: 'Макс', url: s.url, primary: true });
    else if (/vk|вконтакте/.test(k)) ch.push({ label: 'ВКонтакте', url: s.url, primary: true });
    else if (/viber/.test(k)) ch.push({ label: 'Viber', url: s.url, primary: false });
    else if (s.url) ch.push({ label: s.kind || 'ссылка', url: s.url, primary: false });
  }
  if (b.booking && /^https?:/.test(b.booking)) ch.push({ label: 'Онлайн-запись', url: b.booking, primary: false });
  return ch;
}
function score(b) {
  const parts = [];
  const v = b.siteVerdict || (b.site ? 'не проверен' : 'нет');
  if (v === 'нет') parts.push(['нет сайта', 45]);
  else if (v === 'заглушка' || v === 'мёртвый') parts.push([v === 'заглушка' ? 'сайт-заглушка' : 'сайт мёртвый', 35]);
  else if (v === 'старый') parts.push(['сайт устарел', 15]);
  else if (v === 'не проверен') parts.push(['сайт не проверен', 10]);
  const rc = b.reviewsCount ?? b.ratingCount ?? 0;
  if (rc > 50) parts.push(['отзывов больше 50', 25]);
  else if (rc > 10) parts.push(['отзывов 11–50', 15]);
  else parts.push(['отзывов до 10', 5]);
  const r = num(b.rating);
  if (r != null && r >= 4.7) parts.push(['рейтинг от 4,7', 15]);
  else if (r != null && r >= 4.3) parts.push(['рейтинг 4,3–4,6', 10]);
  else parts.push([r == null ? 'рейтинга нет' : 'низкий рейтинг', 5]);
  if (writeChannels(b).some(c => c.primary)) parts.push(['есть куда написать', 10]);
  if (!(b.prices || []).length || /давно/i.test(b.pricesFresh || '')) parts.push([(b.prices || []).length ? 'прайс устарел' : 'прайса нет', 5]);
  const total = Math.min(100, parts.reduce((s, p) => s + p[1], 0));
  return { total, parts, level: total >= 70 ? 'горячо' : total >= 45 ? 'тепло' : 'холодно' };
}
function today() { return new Date().toISOString().slice(0, 10); }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

base.бизнесы.forEach((b, i) => { b['№'] = i + 1; const s = score(b); b.score = s.total; b.level = s.level; b.scoreParts = s.parts; });
base.обновлено = today();
fs.writeFileSync(basePath, JSON.stringify(base, null, 2), 'utf8');

// ---- CSV
const cols = ['№', 'индекс', 'уровень', 'название', 'рубрика', 'адрес', 'телефон', 'куда написать', 'рейтинг', 'оценок', 'отзывов', 'фото', 'сайт', 'вердикт сайта', 'крючок', 'сообщение', 'ссылка на демо', 'статус', 'карточка'];
const csvRows = base.бизнесы.map(b => [b['№'], b.score, b.level, b.name, b.rubric, b.address, b.phone, writeChannels(b).map(c => c.label + ': ' + c.url).join(' | '), b.rating, b.ratingCount, b.reviewsCount, b.photosCount, b.site || '', b.siteVerdict || (b.site ? '' : 'нет'), b.hook?.quote || '', b.message || '', b.demoUrl || '', b.status || 'новый', b.url]);
const csv = '﻿' + [cols, ...csvRows].map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
fs.writeFileSync(path.join(dir, 'база.csv'), csv, 'utf8');

// ---- HTML
const sorted = [...base.бизнесы].sort((a, b) => b.score - a.score);
const stats = {
  total: base.бизнесы.length,
  hot: base.бизнесы.filter(b => b.level === 'горячо').length,
  noSite: base.бизнесы.filter(b => !b.site || ['заглушка', 'мёртвый'].includes(b.siteVerdict)).length,
  writable: base.бизнесы.filter(b => writeChannels(b).some(c => c.primary)).length,
  demos: base.бизнесы.filter(b => b.demoUrl).length
};
const title = `Охота: ${base.город || ''} · ${base.ниша || base.запрос || ''}`.trim();

function siteBadge(b) {
  const v = b.siteVerdict || (b.site ? 'не проверен' : 'нет');
  const cls = { 'нет': 'b-red', 'заглушка': 'b-red', 'мёртвый': 'b-red', 'старый': 'b-amber', 'не проверен': 'b-gray', 'живой': 'b-green' }[v] || 'b-gray';
  const label = { 'нет': 'сайта нет', 'заглушка': 'сайт-заглушка', 'мёртвый': 'сайт мёртвый', 'старый': 'сайт устарел', 'не проверен': 'сайт не проверен', 'живой': 'сайт живой' }[v] || v;
  const link = b.site ? ` <a class="muted" href="${esc(b.site)}" target="_blank" rel="noopener">${esc(b.site.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>` : '';
  const note = b.siteNote ? `<div class="muted small">${esc(b.siteNote)}</div>` : '';
  return `<span class="badge ${cls}">${label}</span>${link}${note}`;
}
function card(b) {
  const ch = writeChannels(b);
  const primary = ch.filter(c => c.primary);
  const channels = ch.length
    ? ch.map(c => `<a class="chip ${c.primary ? 'chip-primary' : ''}" href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.label)}</a>`).join(' ')
    : '';
  const phoneOnly = !primary.length
    ? `<div class="note">В контактах только телефон${b.phone ? ' ' + esc(b.phone) : ''}. Попробуй найти его в Телеграме или Максе по номеру: звонить не будем, работаем в переписке.</div>`
    : '';
  const prices = (b.prices || []).slice(0, 4).map(p => `<li>${esc(p.name)} <b>${esc(p.price)}</b></li>`).join('');
  const pricesBlock = prices
    ? `<ul class="prices">${prices}</ul><div class="muted small">${esc(b.pricesFresh || '')}</div>`
    : `<div class="muted">Цен на карточке нет</div>`;
  const hook = b.hook && b.hook.quote
    ? `<blockquote>«${esc(b.hook.quote)}»<footer>${esc([b.hook.author, b.hook.date].filter(Boolean).join(', '))}${b.hook.stars ? ' · ' + '★'.repeat(b.hook.stars) : ''}</footer></blockquote>${b.hook.why ? `<div class="small">${esc(b.hook.why)}</div>` : ''}`
    : `<div class="muted">Крючок из отзывов не найден${b.hook && b.hook.why ? ': ' + esc(b.hook.why) : ''}</div>`;
  const msg = b.message ? esc(b.message) : '';
  const demo = b.demoUrl
    ? `<a href="${esc(b.demoUrl)}" target="_blank" rel="noopener">${esc(b.demoUrl)}</a>`
    : `<span class="slot">ссылка появится после «собери сайт для №${b['№']}» и публикации</span>`;
  const parts = (b.scoreParts || []).map(p => `${esc(p[0])} +${p[1]}`).join(' · ');
  const rating = b.rating ? `★ ${esc(b.rating)}` : 'без рейтинга';
  const meta = [rating, b.ratingCount != null ? `${b.ratingCount} оценок` : null, b.reviewsCount != null ? `${b.reviewsCount} отзывов` : null, b.photosCount != null ? `${b.photosCount} фото` : null].filter(Boolean).join(' · ');
  const st = b.status || 'новый';
  return `
<article class="card lvl-${b.level}" data-id="${esc(b.id || b['№'])}" data-level="${b.level}" data-nosite="${!b.site || ['заглушка', 'мёртвый'].includes(b.siteVerdict) ? 1 : 0}" data-writable="${primary.length ? 1 : 0}" data-score="${b.score}" data-rating="${num(b.rating) || 0}" data-reviews="${b.reviewsCount ?? b.ratingCount ?? 0}">
  <div class="card-head">
    <div class="score" title="${esc(parts)}"><span class="score-n">${b.score}</span><span class="score-l">${b.level}</span></div>
    <div class="who">
      <div class="num">№${b['№']}</div>
      <h2>${esc(b.name)}</h2>
      <div class="muted">${esc(b.rubric || '')}${b.address ? ' · ' + esc(b.address) : ''}</div>
      <div class="meta">${meta}${b.status_line || ''}</div>
      <div class="why">${esc(parts)}</div>
    </div>
    <div class="status">
      <label>Статус
        <select class="status-select">
          ${['новый', 'написал', 'ответил', 'оплатил', 'отказ'].map(s => `<option ${s === st ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </label>
      <a class="muted small" href="${esc(b.url)}" target="_blank" rel="noopener">карточка на Картах</a>
    </div>
  </div>
  <div class="card-body">
    <section>
      <h3>Сайт</h3>${siteBadge(b)}
      <h3>Куда написать</h3>
      <div class="channels">${channels}</div>${phoneOnly}
      ${b.phone && primary.length ? `<div class="muted small">Телефон: ${esc(b.phone)}</div>` : ''}
      ${b.hours ? `<h3>Часы</h3><div class="small">${esc(b.hours)}</div>` : ''}
      <h3>Цены с карточки</h3>${pricesBlock}
      ${b.promo ? `<div class="small">Акция: ${esc(b.promo)}</div>` : ''}
    </section>
    <section>
      <h3>Крючок из отзывов</h3>${hook}
      <h3>Сообщение <button class="copy" type="button">Скопировать</button></h3>
      <textarea class="msg" readonly rows="8">${msg}</textarea>
      <h3>Ссылка на демо-сайт</h3><div class="demo">${demo}</div>
    </section>
  </div>
</article>`;
}

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--blue:#567FE8;--ink:#2B292E;--gray:#C6C6C6;--bg:#fff;--soft:#F4F6FB;--red:#E3554F;--amber:#E9A23B;--green:#3FA36B}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,"Segoe UI",Roboto,Inter,Arial,sans-serif;padding:24px clamp(16px,4vw,48px) 64px}
header{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-end;justify-content:space-between;margin-bottom:20px}
h1{font-size:clamp(24px,3.4vw,38px);margin:0;letter-spacing:-.01em}
h1 small{display:block;font-size:14px;font-weight:400;color:#6b6970;margin-top:4px}
.board{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:0 0 20px}
.tile{background:var(--soft);border-radius:14px;padding:14px 16px}
.tile b{display:block;font-size:30px;line-height:1.1;color:var(--blue)}
.tile.hot b{color:var(--red)}
.tile span{font-size:13px;color:#6b6970}
.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:16px}
.toolbar .sep{width:1px;height:22px;background:var(--gray);margin:0 6px}
.toolbar button{border:1px solid var(--gray);background:#fff;color:var(--ink);border-radius:999px;padding:6px 14px;font:inherit;font-size:13px;cursor:pointer}
.toolbar button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.card{border:1px solid var(--gray);border-radius:18px;margin-bottom:16px;overflow:hidden;background:#fff}
.card.lvl-горячо{border-color:var(--red)}
.card-head{display:grid;grid-template-columns:auto 1fr auto;gap:18px;padding:18px 20px;background:var(--soft);align-items:start}
.score{width:72px;height:72px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--gray);color:#fff;flex:none}
.lvl-горячо .score{background:var(--red)}.lvl-тепло .score{background:var(--amber)}
.score-n{font-size:26px;font-weight:700;line-height:1}.score-l{font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.num{font-size:12px;color:#6b6970;letter-spacing:.06em}
h2{margin:0;font-size:22px;line-height:1.2}
.meta{margin-top:4px;font-size:14px}
.why{margin-top:6px;font-size:12px;color:#6b6970}
.status{text-align:right;font-size:13px;display:flex;flex-direction:column;gap:8px;align-items:flex-end}
.status select{display:block;margin-top:4px;font:inherit;padding:6px 10px;border-radius:8px;border:1px solid var(--gray);background:#fff}
.card-body{display:grid;grid-template-columns:1fr 1.2fr;gap:0}
.card-body section{padding:16px 20px}
.card-body section+section{border-left:1px solid #e8e8ec}
h3{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#6b6970;margin:14px 0 6px;display:flex;align-items:center;gap:10px}
h3:first-child{margin-top:0}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;color:#fff;vertical-align:middle}
.b-red{background:var(--red)}.b-amber{background:var(--amber)}.b-green{background:var(--green)}.b-gray{background:#9a98a0}
.chip{display:inline-block;padding:6px 12px;border-radius:999px;border:1px solid var(--gray);text-decoration:none;color:var(--ink);font-size:13px;margin:0 6px 6px 0}
.chip-primary{background:var(--blue);border-color:var(--blue);color:#fff}
.note{background:#FFF6E5;border-radius:10px;padding:10px 12px;font-size:13px}
.prices{margin:0;padding-left:18px;font-size:14px}.prices li{margin:2px 0}
blockquote{margin:0;padding:10px 14px;border-left:3px solid var(--blue);background:var(--soft);border-radius:0 10px 10px 0;font-size:14px}
blockquote footer{font-size:12px;color:#6b6970;margin-top:4px}
.msg{width:100%;font:inherit;font-size:14px;border:1px solid var(--gray);border-radius:10px;padding:10px 12px;resize:vertical;background:#fff;color:var(--ink)}
.copy{font:inherit;font-size:12px;text-transform:none;letter-spacing:0;border:1px solid var(--blue);background:#fff;color:var(--blue);border-radius:999px;padding:3px 10px;cursor:pointer}
.copy.done{background:var(--blue);color:#fff}
.demo a{word-break:break-all}
.slot{color:#6b6970;font-size:13px;border:1px dashed var(--gray);border-radius:8px;padding:6px 10px;display:inline-block}
.muted{color:#6b6970}.small{font-size:13px}
a{color:var(--blue)}
footer.page{margin-top:32px;font-size:13px;color:#6b6970}
@media (max-width:760px){.card-head{grid-template-columns:auto 1fr}.status{grid-column:1/-1;flex-direction:row;justify-content:space-between;align-items:center}.card-body{grid-template-columns:1fr}.card-body section+section{border-left:0;border-top:1px solid #e8e8ec}}
</style>
</head>
<body>
<header>
  <h1>${esc(title)}<small>Собрано ${esc(base.создано || base.обновлено)} · обновлено ${esc(base.обновлено)} · запрос «${esc(base.запрос || '')}» · только открытые данные Яндекс.Карт</small></h1>
</header>
<div class="board">
  <div class="tile"><b>${stats.total}</b><span>бизнесов в базе</span></div>
  <div class="tile hot"><b>${stats.hot}</b><span>горячих (индекс 70+)</span></div>
  <div class="tile"><b>${stats.noSite}</b><span>без сайта или с заглушкой</span></div>
  <div class="tile"><b>${stats.writable}</b><span>есть куда написать</span></div>
  <div class="tile"><b>${stats.demos}</b><span>демо-сайтов готово</span></div>
</div>
<div class="toolbar">
  <span class="small muted">Показать:</span>
  <button data-filter="all" class="on">все</button>
  <button data-filter="hot">горячие</button>
  <button data-filter="nosite">без сайта</button>
  <button data-filter="writable">есть куда написать</button>
  <span class="sep"></span>
  <span class="small muted">Сортировать:</span>
  <button data-sort="score" class="on">по индексу</button>
  <button data-sort="reviews">по отзывам</button>
  <button data-sort="rating">по рейтингу</button>
</div>
<main id="list">
${sorted.map(card).join('\n')}
</main>
<footer class="page">Индекс горячести: нет сайта +45 (заглушка или мёртвый +35, устарел +15) · отзывов больше 50 +25 (11–50 +15, до 10 +5) · рейтинг от 4,7 +15 (4,3–4,6 +10, ниже +5) · есть куда написать +10 · прайса нет или устарел +5. От 70 – горячо, 45–69 – тепло. Статусы хранятся в этом браузере; для учёта в таблице рядом лежит база.csv. Скилл «Охотник: клиенты с Карт», курс «Вайб-сайты».</footer>
<script>
(function(){
  var key=function(id){return 'ohota:'+location.pathname+':'+id};
  document.querySelectorAll('.card').forEach(function(c){
    var id=c.dataset.id, sel=c.querySelector('.status-select');
    try{var saved=localStorage.getItem(key(id)); if(saved) sel.value=saved;}catch(e){}
    sel.addEventListener('change',function(){try{localStorage.setItem(key(id),sel.value)}catch(e){}});
    var btn=c.querySelector('.copy'), ta=c.querySelector('.msg');
    btn.addEventListener('click',function(){
      var done=function(){btn.textContent='Скопировано';btn.classList.add('done');setTimeout(function(){btn.textContent='Скопировать';btn.classList.remove('done')},1500)};
      if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(ta.value).then(done,function(){ta.select();document.execCommand('copy');done()})}
      else{ta.select();document.execCommand('copy');done()}
    });
  });
  var list=document.getElementById('list');
  document.querySelectorAll('[data-filter]').forEach(function(b){b.addEventListener('click',function(){
    document.querySelectorAll('[data-filter]').forEach(function(x){x.classList.remove('on')}); b.classList.add('on');
    var f=b.dataset.filter;
    document.querySelectorAll('.card').forEach(function(c){
      var show=f==='all'||(f==='hot'&&c.dataset.level==='горячо')||(f==='nosite'&&c.dataset.nosite==='1')||(f==='writable'&&c.dataset.writable==='1');
      c.style.display=show?'':'none';
    });
  })});
  document.querySelectorAll('[data-sort]').forEach(function(b){b.addEventListener('click',function(){
    document.querySelectorAll('[data-sort]').forEach(function(x){x.classList.remove('on')}); b.classList.add('on');
    var k=b.dataset.sort; var cards=[].slice.call(document.querySelectorAll('.card'));
    cards.sort(function(a,c){return parseFloat(c.dataset[k])-parseFloat(a.dataset[k])});
    cards.forEach(function(c){list.appendChild(c)});
  })});
})();
</script>
</body>
</html>`;
const out = path.join(dir, 'отчёт.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`Отчёт: ${out}\nБаза: ${basePath} (${base.бизнесы.length} бизнесов, горячих ${stats.hot}), CSV рядом.`);

// --open: открыть отчёт в браузере ученика по умолчанию (там работают кнопки «Скопировать» и статусы;
// панель браузера Claude показывает локальный файл снимком без скриптов)
if (args.includes('--open')) {
  const { spawn } = await import('node:child_process');
  const p = process.platform;
  const cmd = p === 'win32' ? ['cmd', ['/c', 'start', '', out]] : p === 'darwin' ? ['open', [out]] : ['xdg-open', [out]];
  spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref();
  console.log('Открыл отчёт в браузере.');
}
