// Охотник: серия касаний и табло отправок – одно правило для сервера карты, отчёта и «кому сегодня писать».
// Серия (курс «Вайб-сайты», урок про серию касаний, 03.10.2026): день 0 – текст со ссылкой, день 1 – ролик,
// день 3 – мягкое прощание, на 10-й день демо снимаем. Ответил / оплатил / отказ – серия стоп.
// Поля бизнеса в база.json: status, statusAt, statusLog, channel, touches {t1, t2, t3}, demoUrl, demoOff.
import fs from 'node:fs';
import path from 'node:path';

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const stamp = () => { const d = new Date(); return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };

export const STATUSES = ['новый', 'написал', 'ответил', 'оплатил', 'отказ'];
export const CHANNELS = ['WhatsApp', 'Telegram', 'MAX', 'ВКонтакте', 'почта', 'другое'];
export const STOP = ['ответил', 'оплатил', 'отказ'];
export const DAYS = { t2: 1, t3: 3, off: 10 };
export const VERSION = '1.2.1'; // версия сервера карты: устаревший сервер (после «обнови скиллы») перезапускается сам

const log = (b, entry) => (b.statusLog = b.statusLog || []).push({ at: stamp(), ...entry });

// статус: «написал» впервые – это день 0 серии (касание 1)
export function setStatus(b, status, from) {
  if (!STATUSES.includes(status)) throw new Error('неизвестный статус: ' + status);
  if (b.status === status) return false;
  b.status = status; b.statusAt = today();
  log(b, { status, from });
  if (status !== 'новый') { b.touches = b.touches || {}; if (!b.touches.t1) b.touches.t1 = today(); }
  return true;
}
export function setTouch(b, n, from) {
  if (![1, 2, 3].includes(+n)) throw new Error('касание бывает 1, 2 или 3');
  b.touches = b.touches || {};
  b.touches['t' + n] = today();
  if (+n === 1 && (!b.status || b.status === 'новый')) { b.status = 'написал'; b.statusAt = today(); }
  log(b, { touch: +n, from });
}
export function setChannel(b, channel, from) { b.channel = channel || null; log(b, { channel: b.channel, from }); }
export function setDemo(b, off, from) { b.demoOff = off ? today() : null; log(b, { demo: off ? 'снято' : 'возвращено', from }); }

// расписание и задачи на сегодня
export function plan(b, on = today()) {
  const t = b.touches || {};
  const t1 = t.t1 || (b.status && b.status !== 'новый' ? b.statusAt : null);
  if (!t1) return null;
  const due2 = addDays(t1, DAYS.t2), due3 = addDays(t1, DAYS.t3), demoUntil = addDays(t1, DAYS.off);
  const live = !STOP.includes(b.status);
  const tasks = [];
  // «написал» без опубликованного демо: серию не ведём – первое сообщение ушло без ссылки (найдено на репетиции 03.10)
  if (live && !b.demoUrl) { tasks.push({ kind: 'nodemo', label: 'Сначала демо', due: t1, late: false }); return { t1, t2: t.t2 || null, t3: t.t3 || null, due2, due3, demoUntil, live, tasks }; }
  if (live && !t.t2 && due2 <= on) tasks.push({ kind: 't2', label: 'Касание 2 – ролик', due: due2, late: due2 < on });
  if (live && t.t2 && !t.t3 && due3 <= on) // третье – только после второго: два сообщения подряд = давление
    tasks.push({ kind: 't3', label: 'Касание 3 – прощание', due: due3, late: due3 < on });
  if (b.demoUrl && !b.demoOff && ['написал', 'отказ'].includes(b.status) && demoUntil <= on) tasks.push({ kind: 'off', label: 'Снять демо', due: demoUntil, late: demoUntil < on });
  return { t1, t2: t.t2 || null, t3: t.t3 || null, due2, due3, demoUntil, live, tasks };
}

// все охоты в папке: строки табло (только те, кому уже писали)
export function scan(root, on = today()) {
  const rows = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const basePath = path.join(root, e.name, 'база.json');
    if (!fs.existsSync(basePath)) continue;
    let base; try { base = JSON.parse(fs.readFileSync(basePath, 'utf8')); } catch { continue; }
    for (const b of base.бизнесы || []) {
      const p = plan(b, on);
      if (!p) continue;
      const demoDir = [path.join(root, `${base.слаг || ''}-${b.id}-demo`)].find((p) => b.id && fs.existsSync(p)) || null;
      rows.push({ hunt: e.name, city: base.город || '', niche: base.ниша || '', n: b['№'], name: b.name, demoDir, status: b.status || 'новый', channel: b.channel || null,
        socials: (b.socials || []).map((s) => ({ kind: s.kind, url: s.url })), demoUrl: b.demoUrl || null, demoOff: b.demoOff || null, ...p });
    }
  }
  return rows;
}
