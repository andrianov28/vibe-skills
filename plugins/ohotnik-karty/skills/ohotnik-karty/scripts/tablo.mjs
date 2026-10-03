#!/usr/bin/env node
// Охотник: «Табло отправок» – кому сегодня писать по всем охотам.
// node tablo.mjs "<папка охот (ohota)>"            – задачи на сегодня текстом (для Клода: «кому сегодня писать?»)
// node tablo.mjs "<папка охот>" --json             – то же в JSON (все строки табло с расписанием)
// node tablo.mjs "<папка охот>" --open             – открыть табло в браузере через сервер карты
// Серия: день 0 – ссылка, день 1 – ролик, день 3 – прощание, день 10 – снять демо (правило в kasaniya.mjs).
import path from 'node:path';
import { scan, today } from './kasaniya.mjs';

const args = process.argv.slice(2);
const root = path.resolve(args.find((a) => !a.startsWith('--')) || '.');
const rows = scan(root);

if (args.includes('--json')) { console.log(JSON.stringify({ today: today(), rows }, null, 2)); process.exit(0); }

if (args.includes('--open')) {
  const { ensureServer, openInBrowser } = await import('./server-start.mjs');
  const up = await ensureServer(root);
  if (!up) { console.log('Сервер карты не запустился – табло не открыть. Задачи на сегодня – ниже.'); }
  else { openInBrowser(up + '/' + encodeURIComponent('табло.html')); console.log(`Открыл «Табло отправок»: ${up}/табло.html – отметки «Отправил», мессенджер и статус сохраняются в базу охоты.`); }
}

const tasks = rows.flatMap((r) => r.tasks.map((t) => ({ r, t }))).sort((a, b) => (a.t.due < b.t.due ? -1 : 1));
const label = (r) => [r.city, r.niche].filter(Boolean).join(' · ') || r.hunt;
const d = (x) => x.slice(8, 10) + '.' + x.slice(5, 7);
console.log(`Сегодня ${d(today())}: в табло ${rows.length} владельцев, задач на сегодня – ${tasks.length}.`);
for (const { r, t } of tasks) {
  console.log(`- ${t.label}${t.late ? ' (просрочено, по плану ' + d(t.due) + ')' : ''}: №${r.n} ${r.name} – охота ${r.hunt} (${label(r)}), ` +
    `мессенджер: ${r.channel || 'не отмечен – спроси ученика'}, первое сообщение ${d(r.t1)}, демо ${r.demoUrl ? r.demoUrl + ' до ' + d(r.demoUntil) : 'не публиковалось'}${r.demoOff ? ' (снято)' : ''}, папка демо: ${r.demoDir || 'не найдена'}.`);
}
if (!tasks.length) console.log('Задач нет: всё отправлено по графику. Новые первые сообщения – из карты охоты.');
