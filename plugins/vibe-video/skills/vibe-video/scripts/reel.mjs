#!/usr/bin/env node
/**
 * Сборка, проверка и рендер ролика.
 *
 *   node reel.mjs build    "<папка сайта>" [--track a|b] [--drop 32]   план по долям, запись прокрутки, проект HyperFrames, lint
 *   node reel.mjs snapshot "<папка сайта>"                              кадры середины каждой сцены → листы для проверки глазами
 *   node reel.mjs render   "<папка сайта>"                              MP4 1080×1920 в <сайт>/video/<Название>-ролик.mp4
 *   node reel.mjs light    "<папка сайта>"                              облегчённая копия (~4 МБ) для мессенджеров: <Название>-ролик-лёгкий.mp4
 *
 * Берёт: <сайт>/video/video.json (сценарий), video/snimki/site.json (съёмка), video/music/track-*.mp3 (музыка).
 * Проект ролика: <сайт>/video/reel/ (index.html можно поправить руками и запустить snapshot/render снова).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { videoOf, readJson, hyperframes, ffmpegBin } from "./env.mjs";
import { analyze, findDrop } from "./beats.mjs";
import { recordScroll } from "./zapis.mjs";
import { html } from "./kadr.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const site = argv.slice(1).find((a, i, all) => !a.startsWith("--") && !(i > 0 && all[i - 1].startsWith("--")));
if (!["build", "snapshot", "render", "light"].includes(cmd) || !site) { console.error("использование: node reel.mjs build|snapshot|render \"<папка сайта>\""); process.exit(1); }
const dir = path.resolve(site);
const vdir = videoOf(dir);
const reel = path.join(vdir, "reel");
const fail = (m) => { console.error("✗ " + m); process.exit(1); };

// ---------------------------------------------------------------- build
if (cmd === "build") {
  const v = readJson(path.join(vdir, "video.json"));
  if (!v) fail(`нет сценария ${path.join(vdir, "video.json")} (или в нём ошибка JSON) – сначала шаг «сценарий»`);
  const shot = readJson(path.join(vdir, "snimki", "site.json"));
  if (!shot) fail("нет съёмки сайта: сначала node snimki.mjs");
  const track = path.join(vdir, "music", `track-${arg("--track", v.track || "a")}.mp3`);
  if (!fs.existsSync(track)) fail(`нет музыки ${track}: сначала node muzyka.mjs`);

  // --- проверка сценария
  const errs = [];
  if (!v.brand) errs.push("brand – название компании");
  const stops = v.phone?.stops || [];
  if (stops.length !== 3) errs.push("phone.stops – ровно 3 остановки прокрутки (block + kicker/title/text)");
  stops.forEach((s, i) => { if (!s.title) errs.push(`phone.stops[${i}].title`); if (!(s.block >= 1 && s.block <= shot.phone.sections.length)) errs.push(`phone.stops[${i}].block – номер блока 1…${shot.phone.sections.length} из списка съёмки`); });
  if (v.prices && !(v.prices.rows?.length >= 1 && v.prices.rows.length <= 3)) errs.push("prices.rows – от 1 до 3 строк {label, value}");
  if (v.photos && !(v.photos.items?.length >= 2 && v.photos.items.length <= 3)) errs.push("photos.items – 2 или 3 фото {file, caption}");
  if (v.photos) v.photos.items?.forEach((it, i) => { if (!fs.existsSync(path.join(dir, it.file || ""))) errs.push(`photos.items[${i}].file – нет файла ${it.file} в папке сайта`); });
  if (v.reviews && !(v.reviews.items?.length >= 1 && v.reviews.items.length <= 3)) errs.push("reviews.items – от 1 до 3 отзывов {text, author}");
  const dBlocks = v.desktop?.blocks || [];
  dBlocks.forEach((b, i) => { if (!(b >= 1 && b <= shot.desktop.sections.length)) errs.push(`desktop.blocks[${i}] – номер блока 1…${shot.desktop.sections.length}`); });
  if (errs.length) fail("в video.json не хватает или неверно:\n  - " + errs.join("\n  - "));
  stops.forEach((s) => { const sec = shot.phone.sections[s.block - 1]; if (sec.slots) console.log(`! блок ${s.block} «${sec.title}» с незаполненными слотами {{…}} – в ролике это будет видно`); });

  // --- музыка и план по долям
  const a = analyze(track);
  const P = a.period, O = a.offset;
  const hasRating = !!v.rating;
  // Дроп музыки должен прийтись на начало сцены телефона (доля hook + 16).
  // Поздний дроп – не тянем хук, а срезаем начало трека целыми тактами; ранний – укорачиваем хук.
  const Dm = Number(arg("--drop", 0)) || findDrop(a, 20, 48);
  let hookLen = hasRating ? 16 : 8;
  let trimBeats = 0;
  if (Dm >= hookLen + 16) trimBeats = Dm - (hookLen + 16);
  else hookLen = Math.max(hasRating ? 12 : 8, Dm - 16);
  const trim = +(trimBeats * P).toFixed(3);
  if (trimBeats) console.log(`… дроп трека на доле ${Dm}: срезаю начало трека на ${trimBeats} долей (${trim} с), чтобы дроп пришёлся на телефон`);
  a.duration = +(a.duration - trim).toFixed(3);
  const labels = (v.hud && v.hud.labels) || {};
  const L = (id, d) => (labels[id] || d).toUpperCase();
  const scenes = [];
  const add = (id, len, label) => { const start = scenes.length ? scenes[scenes.length - 1].start + scenes[scenes.length - 1].len : 0; scenes.push({ id, start, len, label }); };
  add("hook", hookLen, L("hook", hasRating ? "вас уже выбирают" : "знакомьтесь"));
  add("statement", 16, L("statement", "чего не хватало"));
  add("phone", 16, L("phone", "сайт в телефоне"));
  if (v.prices) add("prices", 4 + 2 * v.prices.rows.length, L("prices", "цены"));
  if (v.photos) add("photos", 6, L("photos", "фото"));
  if (v.reviews) add("reviews", [0, 4, 6, 8][v.reviews.items.length], L("reviews", "отзывы"));
  add("desktop", 8, L("desktop", "компьютер"));
  add("final", 12, L("final", "готово"));
  const totalBeats = scenes.reduce((s, x) => s + x.len, 0);
  let duration = +(O + totalBeats * P).toFixed(3);
  if (duration > a.duration - 0.3) {
    const cut = Math.ceil((duration - (a.duration - 0.3)) / P);
    scenes[scenes.length - 1].len = Math.max(8, 12 - cut);
    duration = +(O + scenes.reduce((s, x) => s + x.len, 0) * P).toFixed(3);
    console.log(`! трек короче ролика – финал укорочен до ${scenes[scenes.length - 1].len} долей`);
  }
  const S = Object.fromEntries(scenes.map((s) => [s.id, s]));
  const Bt = (n) => O + n * P;

  // --- запись прокрутки: от выезда телефона до конца сцены телефона
  const recStart = +Bt(S.statement.start + 10).toFixed(3);
  const recEnd = +Bt(S.phone.start + 16).toFixed(3);
  const yOf = (b) => { const s = shot.phone.sections[b - 1]; return s.scroll ?? Math.max(0, s.y - (shot.phone.pinned?.top || 0)); };
  const maxY = shot.phone.pageHeight - shot.phone.height;
  const ys = stops.map((s) => Math.round(Math.max(0, Math.min(maxY, yOf(s.block) + (Number(s.offset) || 0)))));
  const rel = (beat) => Bt(beat) - recStart;
  const keys = [
    { t: 0, y: ys[0], move: 0 },
    { t: rel(S.phone.start + 6), y: ys[1], move: 3 * P },
    { t: rel(S.phone.start + 11.5), y: ys[2], move: 3 * P },
  ];

  fs.rmSync(reel, { recursive: true, force: true });
  for (const d of ["assets/fonts", "assets/site", "assets/photos"]) fs.mkdirSync(path.join(reel, d), { recursive: true });
  console.log(`… план: ${scenes.map((s) => `${s.id} ${s.len}`).join(" · ")} долей, ${a.bpm} BPM → ${duration} с`);
  await recordScroll({ site: dir, keys, duration: +(recEnd - recStart).toFixed(3), out: path.join(reel, "assets", "phone-scroll.mp4") });

  // --- ассеты
  execFileSync(ffmpegBin(), ["-y", "-v", "error", "-ss", String(trim), "-i", track, "-t", String(duration), "-af", `afade=t=out:st=${Math.max(0, duration - 2).toFixed(2)}:d=2`, "-b:a", "192k", path.join(reel, "assets", "music.mp3")]);
  const fonts = (shot.fonts || []).filter((f) => fs.existsSync(path.join(vdir, "snimki", f.file)));
  fonts.forEach((f) => fs.copyFileSync(path.join(vdir, "snimki", f.file), path.join(reel, "assets", "fonts", path.basename(f.file))));
  const desktop = ["desktop-first.png", ...dBlocks.map((b) => shot.desktop.sections[b - 1].file)];
  desktop.forEach((f) => fs.copyFileSync(path.join(vdir, "snimki", f), path.join(reel, "assets", "site", f)));
  if (v.photos) v.photos.items.forEach((it, i) => { it.asset = `p${i}${path.extname(it.file)}`; fs.copyFileSync(path.join(dir, it.file), path.join(reel, "assets", "photos", it.asset)); });

  const dw = parseInt(shot.fontFamilies?.displayWeight, 10);
  const plan = { period: P, offset: O, bpm: a.bpm, duration, scenes, hook: { brand: hasRating ? hookLen - 8 : hookLen }, rec: { start: recStart, duration: +(recEnd - recStart).toFixed(3) },
    hudRight: [v.city, new Date().getFullYear()].filter(Boolean).join(" · ") };
  const page = html({ v, plan, palette: shot.palette, fonts, fam: { display: shot.fontFamilies?.display, text: shot.fontFamilies?.text, displayWeight: dw >= 300 ? dw : 700 }, frame: { desktop } });
  fs.writeFileSync(path.join(reel, "index.html"), page);
  fs.writeFileSync(path.join(reel, "hyperframes.json"), JSON.stringify({ $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", paths: { blocks: "compositions", components: "compositions/components", assets: "assets" } }, null, 2));
  fs.writeFileSync(path.join(reel, "meta.json"), JSON.stringify({ id: "vibe-video", name: `${v.brand} – видео-демо` }, null, 2));
  // сцены со счётчиками (рейтинг и число отзывов в хуке, цены) снимаем в конце, когда цифры доехали:
  // в середине кадр ловит «1 587 ₽» вместо 6 260 и «135» вместо 226 – и проверка зря чинит то, что не сломано (02.10.2026)
  const snapAt = scenes.map((s) => +Bt(s.start + (s.id === "hook" || s.id === "prices" ? s.len - 0.5 : s.len * 0.62)).toFixed(2));
  snapAt.push(+(duration - 1.4).toFixed(2));
  fs.writeFileSync(path.join(reel, "plan.json"), JSON.stringify({ ...plan, snapshotAt: snapAt, track: path.basename(track), trimSeconds: trim }, null, 2));

  const lint = hyperframes(["lint"], reel, { echo: false });
  const errLine = (lint.out.match(/(\d+) error\(s\)/) || [])[1];
  console.log(`✓ проект ролика: ${reel}`);
  scenes.forEach((s) => console.log(`  ${String(Bt(s.start).toFixed(1)).padStart(5)} с  ${s.id.padEnd(9)} ${s.len} долей`));
  console.log(`  длительность ${duration} с · ${a.bpm} BPM · lint: ${errLine === "0" ? "ошибок нет" : "ОШИБКИ – см. ниже"}`);
  if (errLine !== "0") { console.log(lint.out.split("\n").filter((l) => /✗|error/i.test(l)).join("\n")); process.exit(1); }
  if (duration < 30 || duration > 52) console.log(`! длительность ${duration} с вне 30–50 с – добавь или убери сцену (цены, фото, отзывы)`);
}

// ---------------------------------------------------------------- snapshot
if (cmd === "snapshot") {
  const plan = readJson(path.join(reel, "plan.json"));
  if (!plan) fail("сначала node reel.mjs build");
  fs.rmSync(path.join(reel, "snapshots"), { recursive: true, force: true });
  const chk = hyperframes(["check"], reel, { echo: false });
  const passed = /Check passed/.test(chk.out);
  const r = hyperframes(["snapshot", "--at", plan.snapshotAt.join(",")], reel, { echo: false });
  if (r.status !== 0) { console.log(r.out); fail("снимок кадров не удался"); }
  const sheets = fs.readdirSync(path.join(reel, "snapshots")).filter((f) => /^contact-sheet/.test(f)).map((f) => path.join(reel, "snapshots", f));
  console.log(`✓ кадры: ${plan.snapshotAt.join(", ")} с`);
  sheets.forEach((s) => console.log(`  лист: ${s}`));
  console.log(`  проверка HyperFrames: ${passed ? "пройдена" : "есть замечания"}`);
  const warn = chk.out.split("\n").filter((l) => /✗/.test(l)).slice(0, 12);
  if (warn.length) console.log("  замечания:\n" + warn.map((l) => "   " + l.trim()).join("\n"));
}

// ---------------------------------------------------------------- render
if (cmd === "render") {
  const plan = readJson(path.join(reel, "plan.json"));
  const v = readJson(path.join(vdir, "video.json"));
  if (!plan || !v) fail("сначала node reel.mjs build");
  const name = `${String(v.brand).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")}-ролик.mp4`;
  const out = path.join(vdir, name);
  console.log("… рендер (около минуты)");
  const r = hyperframes(["render", "--quality", "high", "--output", out], reel, { echo: false });
  if (r.status !== 0 || !fs.existsSync(out)) { console.log(r.out.split("\n").slice(-15).join("\n")); fail("рендер не удался"); }
  const mb = (fs.statSync(out).size / 1048576).toFixed(1);
  console.log(`✓ готово: ${out}`);
  console.log(`  ${plan.duration} с · 1080×1920 · ${mb} МБ`);
  console.log("  если мессенджер не принимает файл по размеру – скажи «сделай ролик легче»");
}

// ---------------------------------------------------------------- light
if (cmd === "light") {
  const v = readJson(path.join(vdir, "video.json"));
  const name = `${String(v?.brand || "сайт").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")}-ролик`;
  const src = path.join(vdir, name + ".mp4");
  if (!fs.existsSync(src)) fail("сначала node reel.mjs render");
  const out = path.join(vdir, name + "-лёгкий.mp4");
  execFileSync(ffmpegBin(), ["-y", "-v", "error", "-i", src, "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-maxrate", "1.6M", "-bufsize", "3.2M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out]);
  console.log(`✓ лёгкая версия: ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} МБ)`);
}
