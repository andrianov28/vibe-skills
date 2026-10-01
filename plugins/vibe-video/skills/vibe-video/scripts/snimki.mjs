#!/usr/bin/env node
/**
 * Съёмка сайта для ролика.
 *
 *   node snimki.mjs "<папка сайта>"
 *
 * Поднимает папку сайта на локальном порту, снимает телефон (390×844, ×3) и компьютер (1440×900, ×2):
 * первый экран и окно в начале каждого блока <section> (как видит человек; прокрутку в телефоне
 * потом записывает zapis.mjs кадр за кадром). Вытаскивает палитру и шрифты сайта (шрифты скачивает
 * локально – ролик рендерится без интернета-сюрпризов) и список картинок.
 * Результат: <сайт>/video/snimki/ + site.json.
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { requireFromVideo, findChrome, videoOf } from "./env.mjs";

const site = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!site) { console.error("укажи папку сайта"); process.exit(1); }
const dir = path.resolve(site);
if (!fs.existsSync(path.join(dir, "index.html"))) { console.error(`в ${dir} нет index.html`); process.exit(1); }
const out = path.join(videoOf(dir), "snimki");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "fonts"), { recursive: true });

const pw = requireFromVideo("playwright-core");
if (!pw) { console.error("✗ движок ролика не установлен: скажи «настрой видео»"); process.exit(1); }
const chrome = findChrome();
if (!chrome) { console.error("✗ Chrome не найден: установи Google Chrome"); process.exit(1); }

// ---------- локальный сервер папки сайта ----------
const types = { html: "text/html; charset=utf-8", css: "text/css", js: "text/javascript", mjs: "text/javascript", webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", avif: "image/avif", svg: "image/svg+xml", woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", json: "application/json", mp4: "video/mp4", webm: "video/webm" };
const server = http.createServer((req, res) => {
  let p;
  try { p = path.join(dir, decodeURIComponent(req.url.split("?")[0])); } catch { res.writeHead(400); return res.end(); }
  if (!p.startsWith(dir)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": types[path.extname(p).slice(1).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await pw.chromium.launch({ executablePath: chrome, headless: true });
const devices = [
  { name: "phone", width: 390, height: 844, dpr: 3, mobile: true },
  { name: "desktop", width: 1440, height: 900, dpr: 2, mobile: false },
];
const report = { site: dir, shotAt: new Date().toISOString().slice(0, 10) };

for (const d of devices) {
  const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.dpr, isMobile: d.mobile, hasTouch: d.mobile, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // плавная прокрутка сайта мешает замерам – на время съёмки выключаем
  await page.addStyleTag({ content: "html, body { scroll-behavior: auto !important; }" });
  await page.waitForTimeout(900);
  // прокрутка до конца и обратно: срабатывают появления блоков и ленивые картинки
  const total0 = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total0; y += Math.round(d.height * 0.4)) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(110); }
  await page.evaluate(() => {
    document.querySelectorAll(".s-reveal, .v-reveal, [data-reveal], [data-v-reveal]").forEach((e) => e.classList.add("is-in", "in", "visible", "v-in"));
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(out, `${d.name}-first.png`) });

  // закреплённые шапка (сверху) и панель кнопок (снизу) на первом экране – для наложения в ролике
  const pinned = await page.evaluate((vh) => {
    let top = 0, bottom = vh;
    document.querySelectorAll("body *").forEach((e) => {
      const cs = getComputedStyle(e);
      if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) return;
      const r = e.getBoundingClientRect();
      if (r.width < innerWidth * 0.6 || r.height < 24 || r.height > vh * 0.25) return;
      const pinnedPos = cs.position === "fixed" || (cs.position === "sticky" && r.top <= 2 && r.top + scrollY < 4);
      if (!pinnedPos) return;
      if (r.top <= 2) top = Math.max(top, Math.round(r.bottom));
      else if (r.bottom >= vh - 2) bottom = Math.min(bottom, Math.round(r.top));
    });
    return { top, bottom: vh - bottom };
  }, d.height);

  // разделы страницы (абсолютные координаты, css-пиксели)
  const sections = await page.evaluate(() => [...document.querySelectorAll("section")].filter((e) => e.offsetHeight > 80).map((e) => {
    const r = e.getBoundingClientRect();
    const h = e.querySelector("h1,h2,h3");
    const slots = (e.innerText.match(/{{[^}]*}}/g) || []).length;
    return { y: Math.round(r.top + scrollY), h: Math.round(r.height), slots, title: (h?.textContent || e.getAttribute("aria-label") || e.id || e.className || "").replace(/\s+/g, " ").trim().slice(0, 80) };
  }));
  // каждый блок – как его видит человек: окно прокручено к началу блока (под шапку)
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let i = 0; i < sections.length; i++) {
    const y = Math.max(0, Math.min(sections[i].y - pinned.top, pageHeight - d.height));
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(450);
    sections[i].scroll = y;
    sections[i].file = `${d.name}-s${String(i + 1).padStart(2, "0")}.jpg`;
    await page.screenshot({ path: path.join(out, sections[i].file), type: "jpeg", quality: 88 });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  report[d.name] = { width: d.width, height: d.height, dpr: d.dpr, pageHeight, pinned, sections };

  if (d.name === "phone") {
    // палитра, шрифты, заголовки, картинки – один раз, с телефона
    const info = await page.evaluate(() => {
      const hex = (c) => { const m = (c || "").match(/rgba?\(([^)]+)\)/); if (!m) return (c || "").trim() || null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); if (a === 0) return null; return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""); };
      const roots = [document.querySelector(".v-page"), document.documentElement, document.body].filter(Boolean);
      const v = (name) => { for (const r of roots) { const s = getComputedStyle(r).getPropertyValue(name).trim(); if (s) return s; } return ""; };
      const pick = (...names) => { for (const n of names) { const s = v(n); if (s) return hex(s) || s; } return null; };
      const h1 = document.querySelector("h1"), p = document.querySelector("main p, section p, p") || document.body;
      const btn = [...document.querySelectorAll("a, button")].find((e) => { const c = hex(getComputedStyle(e).backgroundColor); return c && !["#ffffff", "#000000"].includes(c) && e.offsetWidth > 60; });
      const bodyBg = hex(getComputedStyle(document.body).backgroundColor) || hex(getComputedStyle(document.documentElement).backgroundColor);
      const first = (ff) => (ff || "").split(",")[0].replace(/["']/g, "").trim();
      return {
        title: document.title,
        h1: (h1?.textContent || "").replace(/\s+/g, " ").trim(),
        description: document.querySelector('meta[name="description"]')?.content || "",
        palette: {
          canvas: pick("--v-canvas", "--c-canvas") || bodyBg || "#0b0d11",
          surface: pick("--v-surface", "--c-surface") || bodyBg || "#141821",
          ink: pick("--v-ink", "--c-ink") || hex(getComputedStyle(h1 || document.body).color) || "#f1ede4",
          soft: pick("--v-ink-soft", "--c-ink-soft") || hex(getComputedStyle(p).color) || "#9d9a92",
          accent: pick("--v-accent", "--c-accent") || (btn && hex(getComputedStyle(btn).backgroundColor)) || "#f2a93b",
          accentInk: pick("--v-accent-ink", "--c-accent-ink") || (btn && hex(getComputedStyle(btn).color)) || "#16110a",
        },
        fonts: { display: first(getComputedStyle(h1 || document.body).fontFamily), text: first(getComputedStyle(p).fontFamily), displayWeight: getComputedStyle(h1 || document.body).fontWeight },
        images: [...new Map([...document.images].filter((i) => i.naturalWidth > 200 && !/^data:/.test(i.getAttribute("src") || "")).map((i) => [i.getAttribute("src"), { src: i.getAttribute("src"), w: i.naturalWidth, h: i.naturalHeight, alt: i.alt || "" }])).values()],
        links: { stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href), inlineCss: [...document.querySelectorAll("style")].map((s) => s.textContent).join("\n") },
      };
    });
    report.title = info.title; report.h1 = info.h1; report.description = info.description;
    report.palette = info.palette; report.fontFamilies = info.fonts; report.images = info.images;
    report._css = info.links;
  }
  await ctx.close();
}
await browser.close();

// ---------- шрифты: собрать @font-face нужных семейств и скачать файлы ----------
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
async function getText(url) {
  if (url.startsWith(base)) { const f = path.join(dir, decodeURIComponent(url.slice(base.length).split("?")[0])); return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : ""; }
  try { const r = await fetch(url, { headers: { "User-Agent": UA } }); return r.ok ? await r.text() : ""; } catch { return ""; }
}
async function getBin(url) {
  if (url.startsWith(base)) { const f = path.join(dir, decodeURIComponent(url.slice(base.length).split("?")[0])); return fs.existsSync(f) ? fs.readFileSync(f) : null; }
  try { const r = await fetch(url, { headers: { "User-Agent": UA } }); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; } catch { return null; }
}
const sheets = [];
async function collect(css, baseUrl, depth = 0) {
  sheets.push({ css, baseUrl });
  if (depth > 2) return;
  for (const m of css.matchAll(/@import\s+(?:url\()?["']?([^"')\s;]+)["']?\)?/g)) {
    const u = new URL(m[1], baseUrl).href; await collect(await getText(u), u, depth + 1);
  }
}
await collect(report._css.inlineCss, base);
for (const href of report._css.stylesheets) await collect(await getText(href), href);
const wanted = new Set([report.fontFamilies.display, report.fontFamilies.text].filter(Boolean).map((s) => s.toLowerCase()));
const faces = [];
for (const { css, baseUrl } of sheets) {
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = m[1];
    const fam = (body.match(/font-family\s*:\s*["']?([^"';]+)["']?/) || [])[1]?.trim();
    if (!fam || !wanted.has(fam.toLowerCase())) continue;
    const range = (body.match(/unicode-range\s*:\s*([^;]+)/) || [])[1]?.trim() || "";
    if (range && !/U\+0?0[0-9A-F]{2}-|U\+0400|U\+0000|U\+0301/i.test(range)) continue; // только кириллица и латиница
    const srcs = [...body.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)\s*(?:format\(\s*["']?([^"')]+)["']?\s*\))?/g)].map((s) => ({ url: new URL(s[1], baseUrl).href, fmt: s[2] || "" }));
    const src = srcs.find((s) => /woff2/.test(s.fmt) || /\.woff2/.test(s.url)) || srcs[0];
    if (!src) continue;
    faces.push({ family: fam, weight: (body.match(/font-weight\s*:\s*([^;]+)/) || [])[1]?.trim() || "400", style: (body.match(/font-style\s*:\s*([^;]+)/) || [])[1]?.trim() || "normal", unicodeRange: range, url: src.url });
  }
}
const fonts = [];
let k = 0;
for (const f of faces) {
  const buf = await getBin(f.url);
  if (!buf) continue;
  const ext = (f.url.match(/\.(woff2|woff|ttf|otf)(\?|$)/) || [, "woff2"])[1];
  const file = `fonts/${f.family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${++k}.${ext}`;
  fs.writeFileSync(path.join(out, file), buf);
  fonts.push({ family: f.family, weight: f.weight, style: f.style, unicodeRange: f.unicodeRange, file });
}
report.fonts = fonts;
delete report._css;
server.close();

fs.writeFileSync(path.join(out, "site.json"), JSON.stringify(report, null, 2));
const ph = report.phone;
console.log(`✓ сайт снят: ${out}`);
console.log(`  заголовок: ${report.h1 || report.title}`);
console.log(`  палитра: фон ${report.palette.canvas}, текст ${report.palette.ink}, акцент ${report.palette.accent}`);
console.log(`  шрифты: ${report.fontFamilies.display} / ${report.fontFamilies.text} – файлов скачано: ${fonts.length}${fonts.length ? "" : " (в ролике будут системные)"}`);
console.log(`  телефон: страница ${ph.pageHeight} px, шапка ${ph.pinned.top} px`);
console.log(`  блоки (телефон, № – y – заголовок):`);
ph.sections.forEach((s, i) => console.log(`   ${i + 1}. y=${s.y} ${s.title}${s.slots ? `  ⚠ незаполненных слотов {{…}}: ${s.slots} – в ролик не брать, пока не заполнены` : ""}`));
console.log(`  блоки (компьютер): ${report.desktop.sections.map((s, i) => `${i + 1}. ${s.title}`).join(" | ")}`);
console.log(`  картинок на сайте: ${report.images.length} (список в site.json)`);
