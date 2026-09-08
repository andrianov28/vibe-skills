#!/usr/bin/env node
/**
 * fetch-lenta.js – забирает ленту биржи проектов Kwork без браузера.
 *
 * Биржа отдаёт список заказов прямо в HTML (window.stateData), логин не нужен.
 * Скрипт проходит ВСЕ страницы выбранной рубрики (и/или поиска по слову) и печатает
 * карточки в том же виде, что ученик видит на сайте, плюс точный возраст заказа.
 *
 * Запуск:
 *   node fetch-lenta.js                     – рубрика «Создание сайта» (c=37), все страницы
 *   node fetch-lenta.js --c 37,11           – несколько рубрик
 *   node fetch-lenta.js --keyword сайт      – поиск по слову по всей бирже
 *   node fetch-lenta.js --c 37 --keyword лендинг
 *   node fetch-lenta.js --pages 3           – не больше 3 страниц на запрос
 *   node fetch-lenta.js --max-age 12        – только заказы моложе 12 часов (по умолчанию 36)
 *   node fetch-lenta.js --all               – без фильтра по возрасту
 *   node fetch-lenta.js --desc 800          – длина описания в карточке (по умолчанию 400 символов)
 *   node fetch-lenta.js --out lenta.txt     – сохранить в файл вместо вывода на экран
 *   node fetch-lenta.js --json              – сырой JSON вместо карточек
 *
 * Правила вежливости: пауза 1,5 с между страницами, обычный браузерный User-Agent,
 * не чаще 2–3 запусков в день. Это чтение публичной страницы, не автоматизация аккаунта.
 */

const args = process.argv.slice(2);
function opt(name, def) {
  const i = args.indexOf('--' + name);
  if (i === -1) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const categories = String(opt('c', '37')).split(',').map(s => s.trim()).filter(Boolean);
const keyword = opt('keyword', '');
const maxPages = Number(opt('pages', 20));
const asJson = opt('json', false) === true;
const maxAgeHours = opt('all', false) === true ? Infinity : Number(opt('max-age', 36)); // по умолчанию только заказы моложе 36 ч
const descLen = Number(opt('desc', 400)); // длина описания в карточке
const outFile = opt('out', '');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function extractState(html) {
  const marker = 'window.stateData=';
  const i = html.indexOf(marker);
  if (i === -1) throw new Error('В HTML нет window.stateData – биржа сменила формат или отдала капчу');
  const s = html.indexOf('{', i);
  let depth = 0, inStr = false, esc = false;
  for (let e = s; e < html.length; e++) {
    const ch = html[e];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return JSON.parse(html.slice(s, e + 1)); }
  }
  throw new Error('Не удалось разобрать stateData');
}

async function fetchPage(params) {
  const url = 'https://kwork.ru/projects?' + new URLSearchParams(params).toString();
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ru-RU,ru;q=0.9', 'Accept': 'text/html' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} на ${url}`);
  const html = await res.text();
  const st = extractState(html);
  const wants = st.wants || st.wantsListData?.wants || [];
  const pag = st.pagination || st.wantsListData?.pagination || {};
  return { wants, total: Number(pag.total || wants.length), perPage: Number(pag.per_page || 12), url };
}

// Время на бирже – московское. Считаем возраст относительно текущего московского времени.
function mskNow() {
  const now = new Date();
  const msk = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  return msk;
}
function ageHours(dateCreate) {
  if (!dateCreate) return null;
  const [d, t] = dateCreate.split(' ');
  const [Y, M, D] = d.split('-').map(Number);
  const [h, m, s] = (t || '00:00:00').split(':').map(Number);
  const created = new Date(Y, M - 1, D, h, m, s || 0);
  return (mskNow() - created) / 36e5;
}
function fmtAge(h) {
  if (h === null || isNaN(h)) return '–';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} мин`;
  if (h < 24) return `${Math.round(h)} ч`;
  return `${(h / 24).toFixed(1).replace('.0', '')} сут.`;
}
function money(v) {
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString('ru-RU') + ' ₽';
}

function decodeEntities(s) {
  const map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '–', ndash: '–', bull: '•', hellip: '…', laquo: '«', raquo: '»', rarr: '→', larr: '←' };
  return String(s)
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code) => {
      if (code[0] === '#') {
        const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return isNaN(n) ? m : String.fromCodePoint(n);
      }
      return map[code.toLowerCase()] ?? m;
    })
    .replace(/<[^>]+>/g, '');
}

function toCard(w, idx) {
  let desc = decodeEntities(w.description || '').replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim();
  if (desc.length > descLen) desc = desc.slice(0, descLen).replace(/\s+\S*$/, '') + '…';
  const price = Number(w.priceLimit);
  const possible = Number(w.possiblePriceLimit);
  const budget = possible && possible !== price
    ? `Желаемый бюджет: до ${money(price)}\nДопустимый: до ${money(possible)}`
    : `Цена до: ${money(price)}`;
  const u = w.user || {};
  const ud = u.data || {};
  const projects = ud.wants_count ?? '–';
  const hired = ud.wants_hired_percent;
  // date_active – когда заказ опубликован на бирже (после модерации или переопубликован); date_create – когда заказчик его написал.
  const published = w.date_active || w.date_create;
  const h = ageHours(published);
  const republished = w.date_active && w.date_create && w.date_active.slice(0, 10) !== w.date_create.slice(0, 10);
  const status = w.altStatusHint?.title || (w.status === 'active' ? 'Сбор предложений' : w.status || '–');
  const badges = (u.badges || []).map(b => b.badge?.title).filter(Boolean).slice(0, 2);
  return [
    `${idx}. ${decodeEntities(w.name || '')}`,
    desc,
    budget,
    `Предложений: ${w.kwork_count ?? '–'}`,
    `Опубликован: ${published || '–'} МСК (возраст ≈ ${fmtAge(h)})${republished ? ` · переопубликован, создан ${w.date_create.slice(0, 10)}` : ''}`,
    `Осталось: ${w.timeLeft || '–'} · Статус: ${status}`,
    `Заказчик: проектов ${projects}${hired !== undefined && hired !== null ? `, нанято ${hired}%` : ''}${badges.length ? ` · ${badges.join(', ')}` : ''}`,
    `Рубрика: ${w.category_id || '–'} · Ссылка: https://kwork.ru/projects/${w.id}`,
  ].join('\n');
}

async function main() {
  const jobs = [];
  if (keyword && categories.length === 0) jobs.push({ keyword });
  else if (keyword) jobs.push({ keyword }, ...categories.map(c => ({ c })));
  else jobs.push(...categories.map(c => ({ c })));

  const all = new Map();
  const notes = [];
  for (const job of jobs) {
    let page = 1, total = 0;
    while (page <= maxPages) {
      const params = { ...job, page: String(page) };
      let r;
      try { r = await fetchPage(params); }
      catch (e) { notes.push(`Ошибка: ${e.message}`); break; }
      r.wants.forEach(w => all.set(w.id, w));
      total = r.total;
      const pages = Math.max(1, Math.ceil(total / (r.perPage || 12)));
      notes.push(`${job.keyword ? `поиск «${job.keyword}»` : `рубрика ${job.c}`}: страница ${page}/${pages}, всего заказов ${total}`);
      if (page >= pages || r.wants.length === 0) break;
      page++;
      await sleep(1500);
    }
  }

  const everything = [...all.values()].sort((a, b) => String(b.date_active || b.date_create).localeCompare(String(a.date_active || a.date_create)));
  const list = everything.filter(w => { const h = ageHours(w.date_active || w.date_create); return h === null || h <= maxAgeHours; });
  const skipped = everything.length - list.length;
  if (skipped) notes.push(`Пропущено ${skipped} заказов старше ${maxAgeHours} ч (нужны все – запусти с --all)`);

  const lines = [];
  const print = s => lines.push(s);

  if (asJson) {
    console.log(JSON.stringify(list.map(w => ({
      id: w.id, name: w.name, description: w.description, priceLimit: Number(w.priceLimit), possiblePriceLimit: Number(w.possiblePriceLimit),
      offers: w.kwork_count, created: w.date_create, published: w.date_active || w.date_create, ageHours: ageHours(w.date_active || w.date_create), timeLeft: w.timeLeft,
      buyerProjects: w.user?.data?.wants_count, buyerHiredPercent: w.user?.data?.wants_hired_percent, status: w.altStatusHint?.title || w.status,
      buyerBadges: (w.user?.badges || []).map(b => b.badge?.title).filter(Boolean),
      category: w.category_id, url: `https://kwork.ru/projects/${w.id}`,
    })), null, 2));
  } else {
    const stamp = mskNow().toLocaleString('ru-RU', { hour12: false });
    print(`Биржа проектов Kwork – срез ${stamp} МСК`);
    print(notes.join('\n'));
    print(`Заказов в выдаче: ${list.length} (всего собрано ${everything.length}). Отсортировано от свежих к старым.\n`);
    list.forEach((w, i) => print(toCard(w, i + 1) + '\n'));
  }

  const text = lines.join('\n');
  if (outFile) {
    require('fs').writeFileSync(outFile, text, 'utf8');
    console.log(`Сохранено: ${outFile} (${list.length} заказов, ${text.length} символов)`);
  } else {
    console.log(text);
  }
}

main().catch(e => { console.error('Сбой: ' + e.message + '\nЗапасной вариант: открой биржу в браузере, Ctrl+A, Ctrl+C и вставь текст Клоду.'); process.exit(1); });
