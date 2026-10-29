#!/usr/bin/env node
/**
 * Видео-отзыв ученика: факты → студия записи → ролик 1080×1920 (~40–60 с).
 *
 *   node otzyv.mjs fakty    "<рабочая папка>"                       что ученик сделал: витрина, работы, охота, бот, радар → отзыв/fakty.json
 *   node otzyv.mjs studiya  "<рабочая папка>"                       «Студия отзыва» в Chrome: суфлёр по фразам и запись голоса (и лица) → отзыв/запись.*
 *   node otzyv.mjs studiya  "<рабочая папка>" --telefon             суфлёр без записи: ученик снимает себя телефоном у экрана
 *   node otzyv.mjs import   "<рабочая папка>" ["<файл>"]            забрать видео/голос с телефона (без файла – самое свежее из Загрузок) → отзыв/запись.*
 *   node otzyv.mjs import   "<рабочая папка>" --foto ["<файл>"]     фото ученика для кружка (если видео нет) → отзыв/фото.jpg
 *   node otzyv.mjs sobrat   "<рабочая папка>" [--format X] [--novyi] собрать проект ролика (формат случайный, --novyi – другой)
 *   node otzyv.mjs snapshot "<рабочая папка>"                       кадры для проверки глазами
 *   node otzyv.mjs render   "<рабочая папка>"                       MP4 → отзыв/Отзыв-<имя>.mp4 (+ лёгкая копия для мессенджеров)
 *
 * Рабочая папка – где лежат vitrina, ohota, bot (обычно папка, в которой ученик работает с Клодом).
 * Текст отзыва пишет Клод: отзыв/текст.json (фразы, плашка с суммой, было/стало, цифры), ответы анкеты – отзыв/анкета.json.
 * Голос с телефона: положить файл в папку «отзыв» с именем «запись» (запись.m4a, запись.mp4 …) – субтитры расставятся по паузам.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readJson, requireFromVideo, ffmpegBin, hyperframes, findChrome } from "./env.mjs";
import { recordScroll } from "./zapis.mjs";
import { html, PALETTES, TRANSITIONS, FORMATS } from "./kompoziciya.mjs";
import { popSounds } from "./vsplyvashki.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const work = path.resolve(argv.slice(1).find((a, i, all) => !a.startsWith("--") && !(i > 0 && all[i - 1].startsWith("--format"))) || ".");
const out = path.join(work, "отзыв");
const reel = path.join(out, "reel");
const fail = (m) => { console.error("✗ " + m); process.exit(1); };
const ok = (m) => console.log("✓ " + m);
const HOME = os.homedir();

// ---------- где что лежит ----------
function vitrinaDir() {
  const cfg = readJson(path.join(HOME, ".vibe", "radar", "config.json"), {});
  for (const d of [cfg.vitrina, path.join(work, "vitrina")]) if (d && fs.existsSync(path.join(d, "vitrina.json"))) return d;
  return null;
}
function botDir() {
  const cfg = readJson(path.join(HOME, ".vibe", "radar", "config.json"), {});
  for (const d of [cfg.bot, path.join(work, "bot")]) if (d && fs.existsSync(path.join(d, "bot.json"))) return d;
  return null;
}
const plural = (n, a, b, c) => { const d = n % 10, dd = n % 100; return d === 1 && dd !== 11 ? a : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? b : c; };

export function fakty() {
  const f = { work, name: null, vitrina: null, cases: [], ohota: null, bot: null, radar: null };
  const vd = vitrinaDir();
  if (vd) {
    const v = readJson(path.join(vd, "vitrina.json"), {});
    f.name = v.name || null;
    f.vitrina = { dir: vd, h1: String(v.h1 || "").replace(/<[^>]+>/g, ""), services: (v.services || []).map((s) => `${s.title} – ${s.price || ""}`) };
    f.cases = (v.cases || []).map((c) => ({ title: c.title, niche: c.niche || "", city: c.city || "", kind: c.kind || "demo", url: c.url || "",
      mobile: c.mobile ? path.join(vd, c.mobile) : null, desktop: c.desktop ? path.join(vd, c.desktop) : null, result: c.result || null, quote: c.quote || null }))
      .filter((c) => (c.mobile && fs.existsSync(c.mobile)) || (c.desktop && fs.existsSync(c.desktop)));
  }
  const oh = path.join(work, "ohota");
  if (fs.existsSync(oh)) {
    const o = { hunts: 0, businesses: 0, demos: 0, first: 0, replied: 0, paid: 0, cities: new Set() };
    for (const e of fs.readdirSync(oh, { withFileTypes: true })) {
      const bf = path.join(oh, e.name, "база.json");
      if (!e.isDirectory() || !fs.existsSync(bf)) continue;
      const b = readJson(bf, {}); o.hunts++; if (b.город) o.cities.add(b.город);
      for (const x of b.бизнесы || []) {
        o.businesses++;
        if (x.demoUrl) o.demos++;
        if (x.touches && x.touches.t1) o.first++;
        const log = (x.statusLog || []).map((l) => l.status).concat(x.status || []);
        if (log.includes("ответил") || log.includes("оплатил")) o.replied++;
        if (log.includes("оплатил")) o.paid++;
      }
    }
    f.ohota = { ...o, cities: [...o.cities] };
  }
  const bd = botDir();
  if (bd) { const b = readJson(path.join(bd, "bot.json"), {}); f.bot = { username: b.botUsername || null, live: !!b.workerUrl, leads: (readJson(path.join(bd, "заявки.json"), { leads: [] }).leads || []).length }; }
  const z = readJson(path.join(HOME, ".vibe", "radar", "zakazy.json"), null);
  if (z) f.radar = { orders: z.orders.length, responded: z.orders.filter((o) => o.status !== "новый").length, taken: z.orders.filter((o) => o.status === "взял").length };
  return f;
}

// ---------- звук: длительность и паузы ----------
function ffprobeBin() { const p = requireFromVideo("ffprobe-static"); return p && p.path && fs.existsSync(p.path) ? p.path : "ffprobe"; }
function probe(file) {
  const r = spawnSync(ffprobeBin(), ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", file], { encoding: "utf8" });
  const j = JSON.parse(r.stdout || "{}");
  let d = parseFloat(j.format?.duration);
  if (!isFinite(d)) { // webm из браузера бывает без длительности – считаем декодированием
    const x = spawnSync(ffmpegBin(), ["-i", file, "-vn", "-f", "null", "-"], { encoding: "utf8" });
    const m = [...(x.stderr || "").matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
    d = m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
  }
  return { duration: d, video: (j.streams || []).some((s) => s.codec_type === "video") };
}
function silences(file) {
  const r = spawnSync(ffmpegBin(), ["-i", file, "-vn", "-af", "silencedetect=noise=-36dB:d=0.3", "-f", "null", "-"], { encoding: "utf8" });
  const s = [...(r.stderr || "").matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const e = [...(r.stderr || "").matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  return s.map((a, i) => ({ s: a, e: e[i] ?? Infinity }));
}
function recording() {
  if (!fs.existsSync(out)) return null;
  const f = fs.readdirSync(out).find((x) => /^запись\.(webm|mp4|m4a|mp3|wav|ogg|oga|opus|aac|mov|3gp|amr)$/i.test(x));
  return f ? path.join(out, f) : null;
}

// квадрат по ширине кадра; faceY – где по высоте центр лица (0 – верх, 1 – низ), из анкеты
const faceCrop = (F) => `crop='min(iw,ih)':'min(iw,ih)':'(iw-min(iw,ih))/2':'max(0,min(ih-min(iw,ih),ih*${F}-min(iw,ih)/2))'`;
// кадр с сеткой через каждые 10% высоты – Клод смотрит, где лицо, и пишет faceY в анкету
function faceFrame(src, at) {
  const dst = path.join(out, "кадр-лица.jpg");
  spawnSync(ffmpegBin(), ["-y", "-v", "error", ...(at ? ["-ss", String(at)] : []), "-i", src, "-frames:v", "1", "-vf", "scale=-2:640,drawgrid=w=iw:h=ih/10:t=1:c=red@0.8", dst]);
  return fs.existsSync(dst) ? dst : null;
}
function photoFile() { const p = path.join(out, "фото.jpg"); return fs.existsSync(p) ? p : null; }

// ---------- студия ----------
function studiya() {
  const t = readJson(path.join(out, "текст.json"));
  if (!t || !t.phrases?.length) fail("нет текста отзыва – сначала анкета и текст (отзыв/текст.json)");
  const an = readJson(path.join(out, "анкета.json"), {});
  const data = { name: t.name || "", face: !!an.face && an.record !== "phone", phone: an.record === "phone" || argv.includes("--telefon"), phrases: t.phrases.map((p) => ({ t: p.t })) };
  const page = fs.readFileSync(path.join(here, "studiya.html"), "utf8").replace("/*DATA*/{}", JSON.stringify(data));
  let saved = 0, phoneTimer = null;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (req.method === "GET" && (u.pathname === "/" || u.pathname === "/index.html")) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(page); }
    if (req.method === "POST" && u.pathname === "/save") {
      const ext = /^(webm|mp4)$/.test(u.searchParams.get("ext")) ? u.searchParams.get("ext") : "webm";
      const chunks = []; req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        for (const x of fs.readdirSync(out)) if (/^запись\./.test(x)) fs.rmSync(path.join(out, x));
        fs.writeFileSync(path.join(out, "запись." + ext), Buffer.concat(chunks)); saved |= 1; res.writeHead(200); res.end("ok"); done();
      });
      return;
    }
    if (req.method === "POST" && u.pathname === "/phone-done") { res.writeHead(200); res.end("ok"); ok("текст прочитан под запись на телефон"); console.log("  дальше: ученик пересылает видео на компьютер и говорит «видео отзыва скачал» → otzyv.mjs import"); clearTimeout(phoneTimer); phoneTimer = setTimeout(() => process.exit(0), 10 * 60 * 1000); return; }
    if (req.method === "POST" && u.pathname === "/marks") {
      let b = ""; req.on("data", (c) => (b += c));
      req.on("end", () => { fs.writeFileSync(path.join(out, "отметки.json"), b); saved |= 2; res.writeHead(200); res.end("ok"); done(); });
      return;
    }
    res.writeHead(404); res.end();
  });
  const done = () => { if (saved === 3) { ok(`отзыв сохранён: ${recording()}`); console.log("  дальше: «собери отзыв»"); setTimeout(() => process.exit(0), 1500); } };
  const tryListen = (port) => server.once("error", () => tryListen(port + 1)).listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}/`;
    const chrome = findChrome();
    if (chrome) spawn(chrome, ["--new-window", url], { detached: true, stdio: "ignore" }).unref();
    else spawn(process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open", process.platform === "win32" ? ["/c", "start", "", url] : [url], { detached: true, stdio: "ignore" }).unref();
    ok(`студия открыта: ${url}`);
    console.log("  ждём запись (студия закроется сама после «Сохранить отзыв», через 60 минут – по таймауту)");
  });
  fs.mkdirSync(out, { recursive: true });
  tryListen(4796);
  setTimeout(() => { console.log("– студия закрыта по таймауту: скажите «открой студию отзыва», чтобы записать"); process.exit(0); }, 60 * 60 * 1000);
}

// ---------- повторы фраз: расшифровка голоса и последний дубль ----------
const norm = (w) => String(w).toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, "");
const toks = (s) => String(s).replace(/\*/g, "").split(/[\s\-–—]+/).map(norm).filter(Boolean);
const same = (a, b) => a === b || /^\d+$/.test(a) || /^\d+$/.test(b) || (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4));
function asrWords(rec) {
  const dir = path.join(out, "_asr");
  const cache = path.join(dir, "transcript.json"), stamp = path.join(dir, "zapis.txt");
  const st = fs.statSync(rec), key = path.basename(rec) + ":" + st.size + ":" + Math.round(st.mtimeMs);
  if (!(fs.existsSync(cache) && fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === key)) {
    console.log("… расшифровка голоса – ищу повторы фраз (первый раз движок может докачать модель)");
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const r = hyperframes(["transcribe", rec, "-d", dir, "-m", "small", "-l", "ru", "--json"], dir, { echo: false });
    if (r.status !== 0 || !fs.existsSync(cache)) return null;
    fs.writeFileSync(stamp, key);
  }
  const j = readJson(cache, []);
  return (Array.isArray(j) ? j : j.words || []).flatMap((x) => toks(x.text ?? x.word ?? "").map((w) => ({ w, s: +x.start, e: +x.end })));
}
// начало фразы: слово совпадает с одним из двух первых слов текста, и рядом ещё хотя бы одно из первых четырёх
function headAt(words, j, P) {
  if (!words[j] || !P.slice(0, 2).some((h) => same(words[j].w, h))) return false;
  const win = words.slice(j, j + 5).map((x) => x.w);
  return P.slice(0, 4).filter((h) => win.some((w) => same(w, h))).length >= Math.min(2, P.length);
}
/** Для каждой фразы – индексы слов её последнего дубля {a, b}. null – если какую-то фразу не нашли. */
function takes(words, phrases) {
  const P = phrases.map(toks), n = P.length, res = Array(n);
  let lim = words.length;
  for (let i = n - 1; i >= 0; i--) {
    let a = -1;
    for (let j = lim - 1; j >= 0; j--) if (headAt(words, j, P[i])) { a = j; break; }
    if (a < 0) return null;
    res[i] = { a, lim }; lim = a;
  }
  for (let i = 0; i < n; i++) {
    // конец дубля: не дальше ожидаемой длины фразы и до фальстарта следующей фразы
    const r = res[i], stop = Math.min(r.lim, r.a + P[i].length + 3);
    let b = stop - 1;
    for (let k = r.a + Math.max(1, P[i].length - 2); k < stop; k++) if (i + 1 < n && headAt(words, k, P[i + 1])) { b = k - 1; break; }
    r.b = Math.max(r.a, b);
  }
  return res;
}

// ---------- сборка ----------
function pickRandom(list, not) { const l = list.filter((x) => x !== not); return (l.length ? l : list)[Math.floor(Math.random() * (l.length ? l.length : list.length))]; }

async function sobrat() {
  const t = readJson(path.join(out, "текст.json"));
  if (!t || !t.phrases?.length) fail("нет текста отзыва (отзыв/текст.json)");
  const an = readJson(path.join(out, "анкета.json"), {});
  const rec = recording();
  if (!rec) fail("нет записи: «открой студию отзыва» или положите файл с голосом в папку «отзыв» с именем «запись»");
  const f = fakty();
  const pr = probe(rec);
  if (pr.duration < 5) fail(`запись слишком короткая (${pr.duration.toFixed(1)} с)`);

  // речь и паузы. Конец – по голосу, а не по кнопке «Закончить»: последнее слово не режем.
  const sil = silences(rec);
  const speechStart = sil.length && sil[0].s < 0.05 ? sil[0].e : 0;
  const lastSil = sil.length ? sil[sil.length - 1] : null;
  const speechEnd = lastSil && lastSil.e >= pr.duration - 0.05 ? lastSil.s : pr.duration;
  const inner = sil.filter((s) => s.s > speechStart + 0.05 && s.e < speechEnd - 0.05);
  // длинные паузы ужимаем до 2×PAD – ролик не теряет темп; звук и лицо режутся одинаково
  const PAD = 0.2, MAXP = 0.45;
  let keeps = []; let k0 = Math.max(0, speechStart - 0.25);
  for (const s of inner) if (s.e - s.s > MAXP) { keeps.push([k0, s.s + PAD]); k0 = s.e - PAD; }
  keeps.push([k0, Math.min(pr.duration, speechEnd + 0.4)]);
  const full = keeps[keeps.length - 1][1] - keeps[0][0];

  // повторы: ученик оговорился и прочитал фразу заново – в ролик идёт только последний дубль каждой фразы
  const n = t.phrases.length;
  let used = n, bounds = null, dubli = 0;
  const words = asrWords(rec);
  const tk = words ? takes(words, t.phrases.map((p) => p.t)) : null;
  if (tk) {
    // начало куска речи, где стоит слово: конец паузы, которая началась до слова (расшифровка часто ставит слово чуть раньше конца паузы)
    const chunkStart = (x) => Math.max(keeps[0][0], ...inner.filter((s) => s.s < x - 0.05).map((s) => s.e));
    const ranges = tk.map((r) => [chunkStart(words[r.a].s) - PAD, words[r.b].e + PAD]);
    for (let i = 0; i + 1 < ranges.length; i++) ranges[i][1] = Math.min(ranges[i][1], ranges[i + 1][0]);
    ranges[ranges.length - 1][1] = Math.max(ranges[ranges.length - 1][1], keeps[keeps.length - 1][1]);
    const next = [];
    for (const [a, b] of keeps) for (const [p, q] of ranges) { const x = Math.max(a, p), y = Math.min(b, q); if (y - x > 0.05) next.push([x, y]); }
    // выброшенные куски речи (дубли и фальстарты): почти не пересекаются с последними дублями
    dubli = keeps.filter(([a, b]) => b - a > 0.5 && ranges.reduce((acc, [p, q]) => acc + Math.max(0, Math.min(b, q) - Math.max(a, p)), 0) < 0.3 * (b - a)).length;
    keeps = next;
    bounds = ranges.slice(1).map((r) => r[0]);
  } else if (words === null) console.log("! расшифровка голоса не удалась – повторы фраз (если были) останутся в ролике");
  else console.log("! не все фразы узнал в записи – повторы фраз (если были) останутся в ролике");
  const map = (x) => { let acc = 0; for (const [p, q] of keeps) { if (x <= p) return acc; if (x <= q) return acc + x - p; acc += q - p; } return acc; };
  const E = +map(Infinity).toFixed(3);
  const D = +(E + 2.6).toFixed(3);
  const cutAway = +(full - E).toFixed(1);

  // границы между фразами (во времени записи): по расшифровке, иначе – по Пробелу, притянутому к паузам
  const mids = inner.map((s) => (s.s + s.e) / 2);
  const nearest = (x, win) => mids.filter((y) => Math.abs(y - x) < win).sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0];
  const marks = readJson(path.join(out, "отметки.json"));
  if (bounds) { /* границы уже по расшифровке */ }
  else if (marks && marks.marks?.length) {
    used = Math.min(n, marks.marks.length);
    if (used < n) console.log(`! прочитано ${used} фраз из ${n} – в ролик пойдут только они`);
    // часы студии и звук расходятся на доли секунды, Пробел жмут с запозданием – находим общий сдвиг и притягиваем к паузам
    const m = marks.marks.slice(1, used);
    const diffs = m.map((x) => { const y = nearest(x, 2); return y == null ? null : y - x; }).filter((d) => d != null).sort((a, b) => a - b);
    const off = diffs.length ? diffs[Math.floor(diffs.length / 2)] : 0;
    bounds = m.map((x) => nearest(x + off, 1.2) ?? x + off);
  } else {
    // голос с телефона: делим по длине фраз и притягиваем границы к паузам
    const lens = t.phrases.map((p) => p.t.replace(/\*/g, "").length), sum = lens.reduce((a, b) => a + b, 0);
    const span = speechEnd - speechStart; let acc = 0;
    bounds = [];
    for (let i = 0; i < n - 1; i++) { acc += lens[i]; const x = speechStart + (span * acc) / sum; bounds.push(nearest(x, 1.2) ?? x); }
  }
  const cuts = [0, ...bounds.map(map), E];
  for (let i = 1; i < cuts.length - 1; i++) cuts[i] = Math.max(cuts[i], cuts[i - 1] + 0.6);
  const segs = t.phrases.slice(0, used).map((p, i) => ({ t: p.t, plashka: p.plashka || null, plashkaLabel: p.plashkaLabel || null, s: +cuts[i].toFixed(3), e: +cuts[i + 1].toFixed(3) }));

  // формат, палитра, переходы – случайно, запоминаем. Записано лицо – оно всегда в ролике: формат «Кружок».
  const cases = f.cases.map((c) => ({ ...c }));
  const face = pr.video && an.face !== false;
  // видео нет, но ученик прислал фото – оно встаёт в кружок
  const photo = !face && an.photo !== false ? photoFile() : null;
  const allowed = face || photo ? ["krug"] : ["cifry"];
  if (!face && f.vitrina) allowed.push("vitrina");
  if (!face && cases.length >= 2) allowed.push("galereya", "bylo");
  const prev = readJson(path.join(out, "otzyv.json"), {});
  if ((face || photo) && opt("--format") && opt("--format") !== "krug") console.log(`! лицо ${photo ? "на фото" : "записано"} – оно всегда в ролике, формат «Кружок» (меняются палитра и переходы)`);
  let format = opt("--format") || (argv.includes("--novyi") ? pickRandom(allowed, prev.format) : prev.format);
  if (!format || !allowed.includes(format)) format = pickRandom(allowed);
  const palette = argv.includes("--novyi") || !prev.palette ? pickRandom(Object.keys(PALETTES), prev.palette) : prev.palette;
  const transition = argv.includes("--novyi") || !prev.transition ? pickRandom(TRANSITIONS, prev.transition) : prev.transition;
  fs.writeFileSync(path.join(out, "otzyv.json"), JSON.stringify({ format, palette, transition, allowed, at: new Date().toISOString() }, null, 2));

  // ассеты
  fs.rmSync(reel, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 }); // браузер проверки может ещё держать файлы
  fs.mkdirSync(path.join(reel, "assets", "works"), { recursive: true });
  fs.copyFileSync(path.join(here, "..", "assets", "logo.png"), path.join(reel, "assets", "logo.png"));
  cases.forEach((c, i) => {
    for (const k of ["mobile", "desktop"]) if (c[k] && fs.existsSync(c[k])) { const dst = `assets/works/${i}-${k}${path.extname(c[k])}`; fs.copyFileSync(c[k], path.join(reel, dst)); c[k] = dst; } else c[k] = null;
    if (!c.mobile) c.mobile = c.desktop;
  });

  // всплывашки: время – по слову из расшифровки (без неё – по месту слова во фразе)
  const NUMW = /^(\d|од|дв|тр|чет|пят|шест|сем|вос|дев|дес|сто|сот|тыс|сорок|милл|полтор)/;
  const sameAt = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4)) || (/^\d+$/.test(a) && NUMW.test(b)) || (/^\d+$/.test(b) && NUMW.test(a));
  const wordAt = (i, w) => {
    const seg = segs[i], wt = toks(w || "")[0];
    if (wt && tk && words) { const r = tk[i]; for (let k = r.a; k <= r.b; k++) if (sameAt(words[k].w, wt)) return Math.min(Math.max(map(words[k].s), seg.s), seg.e - 0.3); }
    const T = toks(t.phrases[i].t), k = wt ? T.findIndex((x) => sameAt(x, wt)) : -1;
    return seg.s + (seg.e - seg.s) * (k > 0 ? k / T.length : 0.08);
  };
  const toNum = (v) => parseInt(String(v ?? "").replace(/\D/g, ""), 10) || 0;
  const pops = []; let wi = 0;
  segs.forEach((sg, i) => {
    const ph = t.phrases[i];
    const list = [].concat(ph.pop || ph.pops || []);
    // плашка с суммой (старая разметка) – теперь всплывашка «деньги»
    if (ph.plashka && !list.some((p) => p.type === "money")) list.push({ type: "money", to: toNum(ph.plashka), label: ph.plashkaLabel, at: toks(ph.t).find((x) => NUMW.test(x)) });
    for (const p of list) {
      const q = { ...p, id: `pop${pops.length}`, s: +Math.max(0.3, wordAt(i, p.at) - 0.05).toFixed(3) };
      if (q.type === "num" || q.type === "money") q.to = toNum(p.to ?? p.value);
      if (q.type === "check") q.items = (p.items || []).map((it) => ({ t: it.t ?? it, atT: Math.max(q.s + 0.2, wordAt(i, it.at ?? it.t ?? it)) }));
      if (q.type === "work") {
        const c = (typeof p.case === "number" ? cases[p.case] : cases.find((x) => p.case && x.title === p.case)) || cases[wi++ % Math.max(1, cases.length)];
        q.img = c ? c.desktop || c.mobile : null;
        q.label = p.label || (c ? [c.title, c.niche].filter(Boolean).join(" · ") : "");
      }
      if (q.type === "work" && !q.img) continue; // нет скрина работы – пустую карточку не показываем
      pops.push(q);
    }
  });
  // сколько держать: до конца фразы, не меньше 2,2 с и не залезая на следующую всплывашку
  pops.sort((a, b) => a.s - b.s).forEach((p, k) => {
    const seg = segs.find((sg) => p.s >= sg.s - 0.1 && p.s < sg.e) || segs[segs.length - 1];
    let e = Math.max(seg.e + 0.2, p.s + 2.2);
    if (p.type === "check" && p.items.length) e = Math.max(e, p.items[p.items.length - 1].atT + 1.2);
    if (pops[k + 1]) e = Math.min(e, pops[k + 1].s - 0.05);
    p.e = +Math.min(e, E).toFixed(3);
  });
  segs.forEach((sg) => { sg.plashka = null; });
  const sfx = popSounds(pops, E).filter((x) => x.t < D - 0.3);

  const music =path.join(here, "..", "music", an.music === "energy" ? "zapas-energy.mp3" : pickRandom(["zapas-soft.mp3", "zapas-energy.mp3"]));
  const sel = keeps.map(([p, q]) => `between(t,${p.toFixed(3)},${q.toFixed(3)})`).join("+");
  const fx = `[0:a]aselect='${sel}',asetpts=N/SR/TB,highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=5:release=150,loudnorm=I=-16:TP=-1.5:LRA=11,apad=whole_dur=${D},aformat=sample_rates=48000:channel_layouts=stereo[v];` +
    `[1:a]atrim=0:${D},asetpts=PTS-STARTPTS,volume='if(gt(t,${E}),0.32,0.08)':eval=frame,afade=t=in:d=0.8,afade=t=out:st=${(D - 1.4).toFixed(2)}:d=1.4,aformat=sample_rates=48000:channel_layouts=stereo[m];` +
    // звуки всплывашек: поп, тик, динь, удар, вжух, нарастание
    sfx.map((x, k) => `[${k + 2}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${Math.round(x.t * 1000)}|${Math.round(x.t * 1000)},volume=${x.v}[s${k}];`).join("") +
    `[v][m]${sfx.map((_, k) => `[s${k}]`).join("")}amix=inputs=${sfx.length + 2}:duration=first:normalize=0[a]`;
  const sfxIn = sfx.flatMap((x) => ["-i", path.join(here, "..", "sfx", x.f + ".wav")]);
  execFileSync(ffmpegBin(), ["-y", "-v", "error", "-i", rec, "-stream_loop", "-1", "-i", music, ...sfxIn, "-filter_complex", fx,"-map", "[a]", "-t", String(D), "-ar", "48000", "-b:a", "192k", path.join(reel, "assets", "audio.mp3")]);
  const faceY = Math.min(0.9, Math.max(0.1, +an.faceY || 0.4));
  if (format === "krug") { const fr = faceFrame(photo || rec, photo ? 0 : Math.min(5, pr.duration / 3)); if (fr) console.log(`  кадр лица: ${fr} (центр лица по высоте сейчас ${faceY}; лицо не по центру кружка – поправь faceY в анкете и собери снова)`); }
  if (format === "krug" && photo) execFileSync(ffmpegBin(), ["-y", "-v", "error", "-i", photo, "-frames:v", "1", "-vf", `${faceCrop(faceY)},scale=900:900`, "-q:v", "3", path.join(reel, "assets", "face.jpg")]);
  if (format === "krug" && !photo) {
    execFileSync(ffmpegBin(), ["-y", "-v", "error", "-i", rec, "-an", "-vf", `fps=30,select='${sel}',setpts=N/30/TB,${faceCrop(faceY)},scale=720:720,fps=30`,
      "-c:v", "libx264", "-g", "15", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", path.join(reel, "assets", "face.mp4")]);
  }
  if (format === "vitrina") {
    console.log("… запись прокрутки витрины");
    const stops = Math.max(3, Math.round(E / 6));
    await recordScroll({ site: f.vitrina.dir, duration: E, out: path.join(reel, "assets", "vitrina.mp4"),
      keys: (max) => [{ t: 0, y: 0, move: 0 }, ...Array.from({ length: stops }, (_, k) => ({ t: +(((k + 1) * E) / (stops + 0.6)).toFixed(2), y: Math.round((max * 0.92 * (k + 1)) / stops), move: 1.8 }))] });
  }

  // цифры: из текста (если Клод задал) или из фактов
  let stats = t.stats;
  if (!stats?.length) {
    stats = [];
    if (an.money?.amount) stats.push({ value: an.money.amount, label: an.money.label || "заработал на сайтах" });
    if (cases.length) stats.push({ value: String(cases.length), label: `${plural(cases.length, "сайт", "сайта", "сайтов")} в моей витрине` });
    if (f.ohota?.businesses) stats.push({ value: String(f.ohota.businesses), label: `${plural(f.ohota.businesses, "бизнес", "бизнеса", "бизнесов")} в базе клиентов` });
    if (f.ohota?.demos) stats.push({ value: String(f.ohota.demos), label: `${plural(f.ohota.demos, "демо-сайт", "демо-сайта", "демо-сайтов")} для владельцев` });
    if (f.ohota?.replied) stats.push({ value: String(f.ohota.replied), label: `${plural(f.ohota.replied, "владелец ответил", "владельца ответили", "владельцев ответили")}` });
    if (f.bot?.live) stats.push({ value: "24/7", label: "бот-продавец принимает заявки" });
    stats = stats.slice(0, 5);
  }
  stats = stats.map((s, i) => ({ ...s, shot: cases.length ? cases[i % cases.length].mobile : null }));
  const bylo = (t.bylo || []).slice(0, 3);
  const stalo = (t.stalo || [`${cases.length} ${plural(cases.length, "сайт", "сайта", "сайтов")}`, "витрина", f.bot?.live ? "бот" : null].filter(Boolean)).slice(0, 4);
  if (format === "bylo" && !bylo.length) bylo.push("ни одного сайта", "не знал, с чего начать");

  const name = t.name || f.name || "Ученик";
  fs.writeFileSync(path.join(reel, "index.html"), html({ name, segs, dur: D, speechEnd: E, format, palette, transition, cases, stats, bylo, stalo, pops, photo: !!photo }));
  fs.writeFileSync(path.join(reel, "hyperframes.json"), JSON.stringify({ $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", paths: { blocks: "compositions", components: "compositions/components", assets: "assets" } }, null, 2));
  fs.writeFileSync(path.join(reel, "meta.json"), JSON.stringify({ id: "vibe-otzyv", name: `${name} – видео-отзыв` }, null, 2));
  // кадры для проверки: начало, каждая всплывашка в полной красе, конец
  const popShots = pops.map((p) => Math.min(p.e - 0.3, p.type === "check" && p.items.length ? p.items[p.items.length - 1].atT + 0.5 : p.s + 1.3));
  const snapAt = [...new Set([1.2, ...(popShots.length ? popShots : [E * 0.3, E * 0.55, E * 0.8]), E + 1.6].map((x) => +x.toFixed(2)))].sort((a, b) => a - b);
  fs.writeFileSync(path.join(reel, "plan.json"), JSON.stringify({ name, format, palette, transition, keeps, speechEnd: E, duration: D, segs, pops, sfx, snapshotAt: snapAt }, null, 2));

  const lint = hyperframes(["lint"], reel, { echo: false });
  const errs = (lint.out.match(/(\d+) error\(s\)/) || [])[1];
  ok(`проект отзыва: ${reel}`);
  console.log(`  формат: ${FORMATS[format]}${photo ? " (фото)" : ""} · палитра: ${PALETTES[palette].name} · переходы: ${transition} · ${D} с (голос ${E} с, фраз ${used}, вырезано пауз и дублей ${cutAway} с${dubli ? ", повторов фраз убрано: " + dubli : ""})`);
  console.log(`  можно было: ${allowed.map((x) => FORMATS[x]).join(", ")}`);
  console.log(`  lint: ${errs === "0" ? "ошибок нет" : "ЕСТЬ ОШИБКИ"}`);
  if (errs !== "0") { console.log(lint.out.split("\n").filter((l) => /✗|error/i.test(l)).join("\n")); process.exit(1); }
  if (E > 75) console.log("! голос длиннее 75 секунд – лучше сократить текст и перезаписать");
}

// ---------- снимки и рендер ----------
function snapshot() {
  const plan = readJson(path.join(reel, "plan.json"));
  if (!plan) fail("сначала «собери отзыв»");
  fs.rmSync(path.join(reel, "snapshots"), { recursive: true, force: true });
  const chk = hyperframes(["check"], reel, { echo: false });
  const r = hyperframes(["snapshot", "--at", plan.snapshotAt.join(",")], reel, { echo: false });
  if (r.status !== 0) { console.log(r.out); fail("снимки не удались"); }
  ok(`кадры: ${plan.snapshotAt.join(", ")} с`);
  fs.readdirSync(path.join(reel, "snapshots")).filter((x) => /^contact-sheet/.test(x)).forEach((x) => console.log("  лист: " + path.join(reel, "snapshots", x)));
  console.log(`  проверка HyperFrames: ${/Check passed/.test(chk.out) ? "пройдена" : "есть замечания"}`);
  chk.out.split("\n").filter((l) => /✗/.test(l)).slice(0, 10).forEach((l) => console.log("   " + l.trim()));
}
function render() {
  const plan = readJson(path.join(reel, "plan.json"));
  if (!plan) fail("сначала «собери отзыв»");
  const base = "Отзыв-" + String(plan.name).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  const file = path.join(out, base + ".mp4");
  console.log("… рендер (около минуты)");
  const r = hyperframes(["render", "--quality", "high", "--output", file], reel, { echo: false });
  if (r.status !== 0 || !fs.existsSync(file)) { console.log(r.out.split("\n").slice(-15).join("\n")); fail("рендер не удался"); }
  const light = path.join(out, base + "-лёгкий.mp4");
  execFileSync(ffmpegBin(), ["-y", "-v", "error", "-i", file, "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-maxrate", "1.8M", "-bufsize", "3.6M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", light]);
  ok(`готово: ${file} (${(fs.statSync(file).size / 1048576).toFixed(1)} МБ)`);
  console.log(`  для мессенджеров: ${light} (${(fs.statSync(light).size / 1048576).toFixed(1)} МБ)`);
}

function importFile() {
  let src = argv.slice(2).find((a) => !a.startsWith("--") && path.resolve(a) !== work);
  if (argv.includes("--foto")) return importFoto(src);
  const VID = /.(mp4|mov|m4v|webm|3gp|m4a|mp3|wav|ogg|oga|opus|aac|amr)$/i;
  if (!src) { // самое свежее видео или аудио в Загрузках и Telegram Desktop за последние 3 часа
    const dirs = [path.join(HOME, "Downloads"), path.join(HOME, "Downloads", "Telegram Desktop"), path.join(HOME, "Загрузки")];
    const files = dirs.filter((d) => fs.existsSync(d)).flatMap((d) => fs.readdirSync(d).filter((x) => VID.test(x)).map((x) => path.join(d, x)));
    const fresh = files.map((f) => ({ f, t: fs.statSync(f).mtimeMs })).filter((x) => Date.now() - x.t < 3 * 3600e3).sort((a, b) => b.t - a.t);
    if (!fresh.length) fail("не нашёл свежего видео в Загрузках – скажите, где лежит файл");
    src = fresh[0].f;
  }
  if (!fs.existsSync(src)) fail("нет файла: " + src);
  fs.mkdirSync(out, { recursive: true });
  for (const x of fs.readdirSync(out)) if (/^запись./.test(x)) fs.rmSync(path.join(out, x));
  fs.rmSync(path.join(out, "отметки.json"), { force: true });
  const dst = path.join(out, "запись" + path.extname(src).toLowerCase());
  fs.copyFileSync(src, dst);
  const p = probe(dst);
  ok(`запись взята: ${src} → ${dst} (${p.duration.toFixed(1)} с, ${p.video ? "видео" : "только звук"})`);
  if (p.video) { const fr = faceFrame(dst, Math.min(5, p.duration / 3)); if (fr) console.log(`  кадр с сеткой: ${fr} – посмотри, где центр лица по высоте, и запиши faceY в анкету (0.1–0.9)`); }
  console.log("  дальше: «собери отзыв»");
}

function importFoto(src) {
  const IMG = /.(jpe?g|png|webp|heic|heif|bmp)$/i;
  if (!src) { // самое свежее фото в Загрузках и Telegram Desktop за последние 3 часа
    const dirs = [path.join(HOME, "Downloads"), path.join(HOME, "Downloads", "Telegram Desktop"), path.join(HOME, "Загрузки"), path.join(HOME, "Pictures")];
    const files = dirs.filter((d) => fs.existsSync(d)).flatMap((d) => fs.readdirSync(d).filter((x) => IMG.test(x)).map((x) => path.join(d, x)));
    const fresh = files.map((f) => ({ f, t: fs.statSync(f).mtimeMs })).filter((x) => Date.now() - x.t < 3 * 3600e3).sort((a, b) => b.t - a.t);
    if (!fresh.length) fail("не нашёл свежего фото в Загрузках – скажите, где лежит файл");
    src = fresh[0].f;
  }
  if (!fs.existsSync(src)) fail("нет файла: " + src);
  fs.mkdirSync(out, { recursive: true });
  const dst = path.join(out, "фото.jpg");
  // целиком, по меньшей стороне до 1200 – кружок вырежется при сборке по faceY
  const r = spawnSync(ffmpegBin(), ["-y", "-v", "error", "-i", src, "-frames:v", "1", "-vf", "scale='if(lt(iw,ih),min(1200,iw),-2)':'if(lt(iw,ih),-2,min(1200,ih))'", "-q:v", "3", dst], { encoding: "utf8" });
  if (r.status !== 0 || !fs.existsSync(dst)) fail(/heic|heif/i.test(src) ? "фото в формате HEIC (iPhone) не открылось – перешлите его себе в Telegram как обычное фото (не файлом) и скачайте" : "фото не открылось: " + (r.stderr || "").trim().split("\n").pop());
  ok(`фото взято: ${src} → ${dst}`);
  const fr = faceFrame(dst);
  if (fr) console.log(`  кадр с сеткой: ${fr} – посмотри, где центр лица по высоте, и запиши faceY в анкету (0.1–0.9)`);
  console.log("  дальше: «собери отзыв» – фото встанет в кружок");
}

if (cmd === "import") importFile();
else if (cmd === "fakty") { const f = fakty(); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, "fakty.json"), JSON.stringify(f, null, 2)); console.log(JSON.stringify(f, null, 2)); }
else if (cmd === "studiya") studiya();
else if (cmd === "sobrat") await sobrat();
else if (cmd === "snapshot") snapshot();
else if (cmd === "render") render();
else { console.error("команды: fakty | studiya | sobrat | snapshot | render"); process.exit(1); }
