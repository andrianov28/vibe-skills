#!/usr/bin/env node
/**
 * Видео-отзыв ученика: факты → студия записи → ролик 1080×1920 (~40–60 с).
 *
 *   node otzyv.mjs fakty    "<рабочая папка>"                       что ученик сделал: витрина, работы, охота, бот, радар → отзыв/fakty.json
 *   node otzyv.mjs studiya  "<рабочая папка>"                       «Студия отзыва» в Chrome: суфлёр по фразам и запись голоса (и лица) → отзыв/запись.*
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

// ---------- студия ----------
function studiya() {
  const t = readJson(path.join(out, "текст.json"));
  if (!t || !t.phrases?.length) fail("нет текста отзыва – сначала анкета и текст (отзыв/текст.json)");
  const an = readJson(path.join(out, "анкета.json"), {});
  const data = { name: t.name || "", face: !!an.face, phrases: t.phrases.map((p) => ({ t: p.t })) };
  const page = fs.readFileSync(path.join(here, "studiya.html"), "utf8").replace("/*DATA*/{}", JSON.stringify(data));
  let saved = 0;
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

  // тайминги фраз
  const sil = silences(rec);
  const speechStart = sil.length && sil[0].s < 0.05 ? sil[0].e : 0;
  const lastSil = sil.length ? sil[sil.length - 1] : null;
  const speechEnd = lastSil && lastSil.e >= pr.duration - 0.05 ? lastSil.s : pr.duration;
  const marks = readJson(path.join(out, "отметки.json"));
  const n = t.phrases.length;
  let cuts; // начало каждой фразы во времени записи + конец
  if (marks && marks.marks?.length) {
    const m = marks.marks.slice(0, n);
    cuts = [Math.max(m[0], speechStart - 0.05), ...m.slice(1), Math.min(marks.stop || pr.duration, speechEnd + 0.5)];
    if (m.length < n) console.log(`! прочитано ${m.length} фраз из ${n} – в ролик пойдут только они`);
  } else {
    // голос с телефона: делим по длине фраз и притягиваем границы к паузам
    const lens = t.phrases.map((p) => p.t.replace(/\*/g, "").length), sum = lens.reduce((a, b) => a + b, 0);
    const span = speechEnd - speechStart; let acc = 0;
    const mids = sil.filter((s) => s.s > speechStart && s.e < speechEnd).map((s) => (s.s + s.e) / 2);
    cuts = [speechStart];
    for (let i = 0; i < n - 1; i++) {
      acc += lens[i]; let x = speechStart + (span * acc) / sum;
      const near = mids.filter((y) => Math.abs(y - x) < 1.2).sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0];
      if (near && near > cuts[cuts.length - 1] + 0.6) x = near;
      cuts.push(x);
    }
    cuts.push(speechEnd + 0.4);
  }
  const t0 = Math.max(0, cuts[0] - 0.35);
  const E = +(cuts[cuts.length - 1] - t0).toFixed(3);
  const D = +(E + 2.6).toFixed(3);
  const used = cuts.length - 1;
  const segs = t.phrases.slice(0, used).map((p, i) => ({ t: p.t, plashka: p.plashka || null, plashkaLabel: p.plashkaLabel || null, s: cuts[i] - t0, e: cuts[i + 1] - t0 }));

  // формат, палитра, переходы – случайно, запоминаем
  const cases = f.cases.map((c) => ({ ...c }));
  const allowed = ["cifry"];
  if (f.vitrina) allowed.push("vitrina");
  if (cases.length >= 2) allowed.push("galereya", "bylo");
  if (an.face && pr.video) allowed.push("krug");
  const prev = readJson(path.join(out, "otzyv.json"), {});
  let format = opt("--format") || (argv.includes("--novyi") ? pickRandom(allowed, prev.format) : prev.format);
  if (!format || !allowed.includes(format)) format = pickRandom(allowed);
  const palette = argv.includes("--novyi") || !prev.palette ? pickRandom(Object.keys(PALETTES), prev.palette) : prev.palette;
  const transition = argv.includes("--novyi") || !prev.transition ? pickRandom(TRANSITIONS, prev.transition) : prev.transition;
  fs.writeFileSync(path.join(out, "otzyv.json"), JSON.stringify({ format, palette, transition, allowed, at: new Date().toISOString() }, null, 2));

  // ассеты
  fs.rmSync(reel, { recursive: true, force: true });
  fs.mkdirSync(path.join(reel, "assets", "works"), { recursive: true });
  fs.copyFileSync(path.join(here, "..", "assets", "logo.png"), path.join(reel, "assets", "logo.png"));
  cases.forEach((c, i) => {
    for (const k of ["mobile", "desktop"]) if (c[k] && fs.existsSync(c[k])) { const dst = `assets/works/${i}-${k}${path.extname(c[k])}`; fs.copyFileSync(c[k], path.join(reel, dst)); c[k] = dst; } else c[k] = null;
    if (!c.mobile) c.mobile = c.desktop;
  });
  const music = path.join(here, "..", "music", an.music === "energy" ? "zapas-energy.mp3" : pickRandom(["zapas-soft.mp3", "zapas-energy.mp3"]));
  const fx = `[0:a]atrim=start=${t0.toFixed(3)}:end=${(t0 + E).toFixed(3)},asetpts=PTS-STARTPTS,highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=5:release=150,loudnorm=I=-16:TP=-1.5:LRA=11,apad=whole_dur=${D}[v];` +
    `[1:a]atrim=0:${D},asetpts=PTS-STARTPTS,volume='if(gt(t,${E}),0.32,0.09)':eval=frame,afade=t=in:d=0.8,afade=t=out:st=${(D - 1.4).toFixed(2)}:d=1.4[m];[v][m]amix=inputs=2:duration=first:normalize=0[a]`;
  execFileSync(ffmpegBin(), ["-y", "-v", "error", "-i", rec, "-stream_loop", "-1", "-i", music, "-filter_complex", fx, "-map", "[a]", "-t", String(D), "-ar", "48000", "-b:a", "192k", path.join(reel, "assets", "audio.mp3")]);
  if (format === "krug") {
    execFileSync(ffmpegBin(), ["-y", "-v", "error", "-i", rec, "-an", "-vf", `trim=start=${t0.toFixed(3)}:end=${(t0 + E).toFixed(3)},setpts=PTS-STARTPTS,crop='min(iw,ih)':'min(iw,ih)',scale=720:720,fps=30`,
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
  fs.writeFileSync(path.join(reel, "index.html"), html({ name, segs, dur: D, speechEnd: E, format, palette, transition, cases, stats, bylo, stalo }));
  fs.writeFileSync(path.join(reel, "hyperframes.json"), JSON.stringify({ $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", paths: { blocks: "compositions", components: "compositions/components", assets: "assets" } }, null, 2));
  fs.writeFileSync(path.join(reel, "meta.json"), JSON.stringify({ id: "vibe-otzyv", name: `${name} – видео-отзыв` }, null, 2));
  const plate = segs.find((s) => s.plashka);
  const snapAt = [1.2, E * 0.3, E * 0.55, E * 0.8, ...(plate ? [plate.s + 0.9] : []), E + 1.6].map((x) => +x.toFixed(2)).sort((a, b) => a - b);
  fs.writeFileSync(path.join(reel, "plan.json"), JSON.stringify({ name, format, palette, transition, t0, speechEnd: E, duration: D, segs, snapshotAt: snapAt }, null, 2));

  const lint = hyperframes(["lint"], reel, { echo: false });
  const errs = (lint.out.match(/(\d+) error\(s\)/) || [])[1];
  ok(`проект отзыва: ${reel}`);
  console.log(`  формат: ${FORMATS[format]} · палитра: ${PALETTES[palette].name} · переходы: ${transition} · ${D} с (голос ${E} с, фраз ${used})`);
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

if (cmd === "fakty") { const f = fakty(); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, "fakty.json"), JSON.stringify(f, null, 2)); console.log(JSON.stringify(f, null, 2)); }
else if (cmd === "studiya") studiya();
else if (cmd === "sobrat") await sobrat();
else if (cmd === "snapshot") snapshot();
else if (cmd === "render") render();
else { console.error("команды: fakty | studiya | sobrat | snapshot | render"); process.exit(1); }
