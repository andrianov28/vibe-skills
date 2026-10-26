#!/usr/bin/env node
/**
 * Витрина веб-мастера: свой сайт ученика с услугами и работами.
 *
 *   node vitrina.mjs find [--root <папка>]          найти опубликованные сайты ученика (папки с .publish/publish.json)
 *   node vitrina.mjs init "<папка витрины>"          создать папку и vitrina.json с пустыми полями
 *   node vitrina.mjs shots "<папка витрины>" [--only <номер>] [--force]
 *                                                   снять работы: первый экран компьютера + «лента» телефона
 *   node vitrina.mjs build "<папка витрины>"         собрать index.html из vitrina.json
 *
 * vitrina.json: name, city, cityIn (предложный падеж: «Таганроге»), photo (путь к фото), palette (А|Б|В),
 * messengers { telegram: "ник", whatsapp: "79…", max: "ссылка на профиль" }, message (готовый текст сообщения),
 * services [{ title, desc, price }], cases [{ title, niche, city, url, kind: "real"|"demo", folder,
 * task, did, result, quote, quoteAuthor, about, desktop, mobile }].
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireFromBuild, findChrome, home } from "./vibe-env.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const TPL = path.join(here, "..", "templates", "vitrina", "index.html");
const [cmd, ...rest] = process.argv.slice(2);
const flag = (n) => { const i = rest.indexOf(n); return i > -1 ? rest[i + 1] : null; };
const dirArg = rest.find((a) => !a.startsWith("--") && a !== flag("--root") && a !== flag("--only"));
const ok = (s) => console.log("✓ " + s), info = (s) => console.log("  " + s), fail = (s) => { console.error("✗ " + s); process.exit(1); };

const PALETTES = {
  "А": { name: "ультрамарин", vars: "--accent:#2F54EB; --ink:#14151A; --soft:#F1F3FA;" },
  "Б": { name: "изумруд", vars: "--accent:#0C7A58; --ink:#10201A; --soft:#EDF5F1;" },
  "В": { name: "коралл", vars: "--accent:#DD4B33; --ink:#1B1A1F; --soft:#F7F1EE;" },
};

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const cfgPath = (d) => path.join(d, "vitrina.json");

// ---------- find ----------
function titleOf(dir) {
  try { const m = fs.readFileSync(path.join(dir, "index.html"), "utf8").match(/<title>([^<]*)<\/title>/i); return m ? m[1].trim() : ""; } catch { return ""; }
}
function briefOf(dir) {
  try {
    const b = fs.readFileSync(path.join(dir, "brief.md"), "utf8");
    const pick = (re) => { const m = b.match(re); return m ? m[1].trim().replace(/\*+/g, "") : ""; };
    return { niche: pick(/Ниша[^:\n]*:\s*([^\n|]+)/i), city: pick(/Город[^:\n]*:\s*([^\n|]+)/i) };
  } catch { return {}; }
}
function find(roots) {
  const found = [], seen = new Set();
  const walk = (d, depth) => {
    if (depth > 6) return;
    let items; try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (!it.isDirectory() || it.name === "node_modules" || it.name.startsWith(".git")) continue;
      const p = path.join(d, it.name);
      if (it.name === ".publish") {
        try {
          const c = readJson(path.join(p, "publish.json"));
          if (c.url && !c.off && !seen.has(c.url)) { seen.add(c.url); found.push({ folder: d, url: c.url, title: titleOf(d), ...briefOf(d) }); }
        } catch {}
        continue;
      }
      walk(p, depth + 1);
    }
  };
  roots.forEach((r) => walk(r, 0));
  return found;
}

// ---------- shots ----------
async function shots(dir) {
  const cfg = readJson(cfgPath(dir));
  const pw = requireFromBuild("playwright-core"), sharp = requireFromBuild("sharp");
  if (!pw || !sharp) fail("нет playwright-core или sharp: скажи «настрой сборку сайтов»");
  const chrome = findChrome(); if (!chrome) fail("Chrome не найден");
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  const browser = await pw.chromium.launch({ executablePath: chrome, headless: true });
  const only = flag("--only"), force = rest.includes("--force");
  for (const [i, c] of cfg.cases.entries()) {
    const n = i + 1;
    if (only && String(n) !== only) continue;
    if (!c.url) { info(`№${n} «${c.title}»: нет ссылки – пропускаю`); continue; }
    if (c.desktop && c.mobile && !force) { info(`№${n} «${c.title}»: снимки уже есть`); continue; }
    // компьютер: первый экран
    const d = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await d.goto(c.url, { waitUntil: "networkidle", timeout: 45000 }); await d.waitForTimeout(1800);
      const buf = await d.screenshot();
      c.desktop = `assets/case-${n}-desktop.webp`;
      await sharp(buf).resize({ width: 1200 }).webp({ quality: 78 }).toFile(path.join(dir, c.desktop));
    } catch (e) { info(`№${n}: компьютер не снялся – ${e.message.split("\n")[0]}`); }
    await d.close();
    // телефон: несколько экранов подряд склеиваются в ленту – она прокручивается в рамке телефона
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.4, isMobile: true, hasTouch: true });
    const m = await ctx.newPage();
    try {
      await m.goto(c.url, { waitUntil: "networkidle", timeout: 45000 }); await m.waitForTimeout(1500);
      const total = await m.evaluate(() => document.documentElement.scrollHeight);
      const frames = Math.max(1, Math.min(6, Math.ceil(total / 844)));
      const parts = [];
      for (let f = 0; f < frames; f++) {
        await m.evaluate((y) => window.scrollTo(0, y), f * 844); await m.waitForTimeout(f ? 900 : 300);
        parts.push(await m.screenshot());
      }
      const W = Math.round(390 * 1.4), H = Math.round(844 * 1.4);
      c.mobile = `assets/case-${n}-mobile.webp`;
      await sharp({ create: { width: W, height: H * parts.length, channels: 3, background: "#ffffff" } })
        .composite(parts.map((input, k) => ({ input, left: 0, top: k * H }))).webp({ quality: 70 }).toFile(path.join(dir, c.mobile));
    } catch (e) { info(`№${n}: телефон не снялся – ${e.message.split("\n")[0]}`); }
    await ctx.close();
    ok(`№${n} «${c.title}» снят`);
  }
  await browser.close();
  fs.writeFileSync(cfgPath(dir), JSON.stringify(cfg, null, 2));
}

// ---------- build ----------
async function build(dir) {
  const cfg = readJson(cfgPath(dir));
  if (!cfg.name) fail("в vitrina.json нет имени (name)");
  let pal = cfg.palette;
  if (!PALETTES[pal]) { const seed = [...cfg.name].reduce((s, ch) => s + ch.charCodeAt(0), 0); pal = ["А", "Б", "В"][seed % 3]; cfg.palette = pal; }
  // фото: пережать в assets/photo.webp
  if (cfg.photo && !/^assets\/photo\.webp$/.test(cfg.photo)) {
    const src = path.isAbsolute(cfg.photo) ? cfg.photo : path.join(dir, cfg.photo);
    const sharp = requireFromBuild("sharp");
    if (sharp && fs.existsSync(src)) {
      fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
      await sharp(src).rotate().resize(400, 400, { fit: "cover", position: "attention" }).webp({ quality: 82 }).toFile(path.join(dir, "assets", "photo.webp"));
      cfg.photo = "assets/photo.webp";
    } else { info(`фото ${cfg.photo} не найдено – будет кружок с инициалами`); cfg.photo = ""; }
  }
  if (!cfg.message) cfg.message = "Здравствуйте! Хочу заказать сайт. Посмотрел ваши работы на витрине – расскажите, как начать?";
  const title = `${cfg.name} – сайты для малого бизнеса${cfg.city ? ", " + cfg.city : ""}`;
  const desc = cfg.lead || "Соберу готовое демо вашего сайта до разговора – вы смотрите результат, а потом решаете.";
  const og = cfg.cases?.find((c) => c.desktop)?.desktop;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const html = fs.readFileSync(TPL, "utf8")
    .replaceAll("{{TITLE}}", esc(title)).replaceAll("{{DESC}}", esc(desc))
    .replace("{{OG_IMAGE}}", og ? `<meta property="og:image" content="${esc(og)}">` : "")
    .replace("{{PALETTE}}", PALETTES[pal].vars)
    .replace("{{DATA}}", JSON.stringify(cfg).replace(/</g, "\\u003c"));
  fs.writeFileSync(path.join(dir, "index.html"), html);
  fs.writeFileSync(cfgPath(dir), JSON.stringify(cfg, null, 2));
  const real = (cfg.cases || []).filter((c) => c.kind === "real").length;
  ok(`витрина собрана: работ – ${cfg.cases?.length || 0}, из них реальных заказов – ${real}, палитра ${pal} – ${PALETTES[pal].name}`);
  const miss = [];
  if (!cfg.messengers || !Object.values(cfg.messengers).some(Boolean)) miss.push("мессенджер для кнопки «Написать»");
  if (!cfg.photo) miss.push("фото (сейчас кружок с инициалами)");
  if (!(cfg.services || []).length) miss.push("услуги и цены");
  (cfg.cases || []).forEach((c, i) => { if (!c.mobile) miss.push(`снимки работы №${i + 1} (скажи «сними работы»)`); });
  if (miss.length) info("не хватает: " + miss.join("; "));
}

// ---------- init ----------
function init(dir) {
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(cfgPath(dir))) { ok(`vitrina.json уже есть в ${dir}`); return; }
  fs.writeFileSync(cfgPath(dir), JSON.stringify({ name: "", city: "", cityIn: "", photo: "", palette: "", messengers: { telegram: "", whatsapp: "", max: "" }, message: "", services: [], cases: [] }, null, 2));
  ok(`создал ${cfgPath(dir)}`);
}

if (cmd === "find") {
  const roots = flag("--root") ? [flag("--root")] : [process.cwd(), path.join(home, "Documents"), path.join(home, "Desktop")].filter((r, i, a) => fs.existsSync(r) && a.indexOf(r) === i);
  const list = find(roots);
  console.log(JSON.stringify(list, null, 2));
  ok(`найдено опубликованных сайтов: ${list.length}`);
} else if (cmd === "init") { if (!dirArg) fail("нужна папка витрины"); init(path.resolve(dirArg)); }
else if (cmd === "shots") { if (!dirArg) fail("нужна папка витрины"); await shots(path.resolve(dirArg)); }
else if (cmd === "build") { if (!dirArg) fail("нужна папка витрины"); await build(path.resolve(dirArg)); }
else { console.log("команды: find | init <папка> | shots <папка> | build <папка>"); }
