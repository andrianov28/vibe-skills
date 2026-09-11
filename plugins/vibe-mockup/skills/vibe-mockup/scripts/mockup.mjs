#!/usr/bin/env node
/**
 * Мокап сайта для портфолио: ноутбук + телефон + подпись, в палитре и шрифтах самого сайта.
 *
 *   node mockup.mjs "<папка сайта>" --caption "Лендинг по натяжным потолкам" [--sub "одностраничный сайт · адаптив"]
 *                   [--layout 1|2] [--size 1320x880] [--out <файл.png>] [--shots <папка с 00-top.png>]
 *
 * Что делает: поднимает папку сайта на локальном порту, снимает первый экран на 1440×900 и 390×844
 * тем же Chrome, что и проверка сайта, собирает HTML-композицию (рамки ноутбука и телефона – CSS,
 * фон и подпись – из палитры и шрифтов сайта) и снимает её в PNG и JPG.
 * Kwork: обложка кворка от 660×440 px, 30 КБ – 10 МБ, jpg/png (форма биржи, 11.09.2026). По умолчанию
 * делаем 1320×880 – ровно вдвое больше минимума, то же соотношение 3:2.
 * Пакеты playwright-core и sharp берём из папки сборки ~/.vibe/build (ставит скилл «Вайб-сайт», «настрой сборку сайтов»).
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const site = argv.find((a) => !a.startsWith("--") && !["--caption", "--sub", "--layout", "--size", "--out", "--shots"].includes(argv[argv.indexOf(a) - 1]));
if (!site) { console.error("укажи папку сайта"); process.exit(1); }
const dir = path.resolve(site);
const indexFile = path.join(dir, "index.html");
if (!fs.existsSync(indexFile)) { console.error(`в ${dir} нет index.html`); process.exit(1); }
const [W, H] = (arg("--size", "1320x880")).split("x").map(Number);
const layout = arg("--layout", "1");
const outFile = path.resolve(arg("--out", path.join(dir, "portfolio", "mockup.png")));
const shotsDir = arg("--shots", null);

// ---------- пакеты и Chrome (как в скилле «Вайб-сайт») ----------
const home = process.env.USERPROFILE || process.env.HOME || "";
const buildDir = process.env.VIBE_BUILD_DIR || path.join(home, ".vibe", "build");
function requireFromBuild(name) {
  for (const d of [process.cwd(), buildDir]) { try { return createRequire(path.join(d, "package.json"))(name); } catch {} }
  return null;
}
const chrome = process.env.VIBE_CHROME || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  (process.env.LOCALAPPDATA || "") + "/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
].find((p) => p && fs.existsSync(p));
const pw = requireFromBuild("playwright-core");
if (!pw) { console.error("не найден playwright-core: скажи «настрой сборку сайтов» (скилл «Вайб-сайт»)"); process.exit(1); }
if (!chrome) { console.error("Chrome не найден: установи Google Chrome"); process.exit(1); }
const sharp = requireFromBuild("sharp");

// ---------- палитра, шрифты, подпись ----------
const html = fs.readFileSync(indexFile, "utf8");
// тема сайта – последний блок `.v-page { … --v-font-display … }` (в самодостаточных файлах движок вшит первым, его цвета не берём;
// локальные переопределения --v-canvas внутри глав идут без шрифтов и тоже не считаются)
const themeBlocks = [...html.matchAll(/\.v-page\s*\{([^}]*--v-font-display[^}]*)\}/g)].map((m) => m[1]);
const theme = themeBlocks.length ? themeBlocks[themeBlocks.length - 1] : html;
const cssVar = (name, d) => { const m = theme.match(new RegExp(`--v-${name}\\s*:\\s*([^;]+);`)) || html.match(new RegExp(`--v-${name}\\s*:\\s*([^;]+);`)); return m ? m[1].trim() : d; };
const pal = {
  canvas: cssVar("canvas", "#f4f2ee"), surface: cssVar("surface", "#ffffff"),
  ink: cssVar("ink", "#1b1b1b"), inkSoft: cssVar("ink-soft", "#6b6b6b"),
  accent: cssVar("accent", "#c8553d"), accentInk: cssVar("accent-ink", "#ffffff"),
  fontDisplay: cssVar("font-display", '"Manrope", system-ui, sans-serif'), fontText: cssVar("font-text", 'system-ui, sans-serif'),
};
const fontLinks = [...html.matchAll(/<link[^>]+href="(https:\/\/fonts\.googleapis\.com\/css2?[^"]+)"[^>]*>/gi)].map((m) => `<link rel="stylesheet" href="${m[1]}">`).join("");
const titleRaw = (html.match(/<title>([^<]*)<\/title>/i) || [, ""])[1].replace(/\{\{[^}]*\}\}/g, "").replace(/[·|–—-]\s*$|^\s*[·|–—-]/g, "").trim();
const caption = arg("--caption", titleRaw || "Одностраничный сайт");
const sub = arg("--sub", "одностраничный сайт · адаптив под телефон");

// ---------- скриншоты ----------
const mime = "image/png";
const server = http.createServer((req, res) => {
  const p = path.join(dir, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "index.html") : p;
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const ext = path.extname(f).slice(1);
  const types = { html: "text/html; charset=utf-8", css: "text/css", js: "text/javascript", webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", woff2: "font/woff2", woff: "font/woff", json: "application/json" };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await pw.chromium.launch({ executablePath: chrome, headless: true });
async function shoot(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const buf = await page.screenshot({ type: "png" });
  await ctx.close();
  return buf;
}
let desk, mob;
if (shotsDir && fs.existsSync(path.join(shotsDir, "desktop", "00-top.png")) && fs.existsSync(path.join(shotsDir, "mobile", "00-top.png"))) {
  desk = fs.readFileSync(path.join(shotsDir, "desktop", "00-top.png")); mob = fs.readFileSync(path.join(shotsDir, "mobile", "00-top.png"));
} else {
  desk = await shoot(1440, 900); mob = await shoot(390, 844);
}
server.close();
const dataUrl = (b) => `data:${mime};base64,${b.toString("base64")}`;

// ---------- композиция ----------
const dark = (() => { const m = pal.canvas.match(/^#([0-9a-f]{6})$/i); if (!m) return false; const n = parseInt(m[1], 16); const l = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; return l < 0.45; })();
const layouts = {
  // 1: подпись слева, ноутбук справа, телефон перед ноутбуком слева-снизу
  "1": { laptop: { w: 0.62, x: 0.42, y: 0.15 }, phone: { h: 0.60, x: 0.255, y: 0.38 }, text: { x: 0.055, y: 0.12, w: 0.33 } },
  // 2: подпись сверху по центру во всю ширину, ноутбук по центру ниже, телефон справа
  "2": { laptop: { w: 0.62, x: 0.10, y: 0.30 }, phone: { h: 0.56, x: 0.70, y: 0.40 }, text: { x: 0.05, y: 0.07, w: 0.9, center: true } },
}[layout] || null;
if (!layouts) { console.error("--layout 1 или 2"); process.exit(1); }
const L = layouts;
const lapW = Math.round(W * L.laptop.w), lapScreenH = Math.round((lapW - 24) * 900 / 1440);
const phoneH = Math.round(H * L.phone.h), phoneW = Math.round(phoneH * 390 / 844);
const page = `<!doctype html><html lang="ru"><head><meta charset="utf-8">${fontLinks}
<style>
  html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
  body { background: ${pal.canvas}; font-family: ${pal.fontText}; color: ${pal.ink}; position: relative; }
  .glow { position: absolute; inset: 0; background:
      radial-gradient(60% 70% at 78% 30%, color-mix(in oklab, ${pal.accent} ${dark ? "28%" : "16%"}, transparent), transparent 70%),
      radial-gradient(45% 55% at 10% 90%, color-mix(in oklab, ${pal.accent} ${dark ? "18%" : "10%"}, transparent), transparent 70%); }
  .grain { position: absolute; inset: 0; opacity: .5; mix-blend-mode: ${dark ? "screen" : "multiply"};
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 .07 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E"); }
  .laptop { position: absolute; left: ${Math.round(W * L.laptop.x)}px; top: ${Math.round(H * L.laptop.y)}px; width: ${lapW}px; }
  .laptop .screen { box-sizing: border-box; border: 12px solid #15171a; border-bottom-width: 18px; border-radius: 16px 16px 6px 6px; background: #15171a; overflow: hidden;
      box-shadow: 0 30px 60px rgb(0 0 0 / .28), 0 8px 18px rgb(0 0 0 / .18); }
  .laptop .screen img { display: block; width: 100%; height: ${lapScreenH}px; object-fit: cover; object-position: top; }
  .laptop .base { height: 14px; margin: 0 -3%; background: linear-gradient(#2a2d31, #1a1c1f); border-radius: 0 0 14px 14px; box-shadow: 0 10px 24px rgb(0 0 0 / .25); }
  .laptop .base::after { content: ""; display: block; width: 14%; height: 5px; margin: 0 auto; background: #0c0d0f; border-radius: 0 0 6px 6px; }
  .phone { position: absolute; left: ${Math.round(W * L.phone.x)}px; top: ${Math.round(H * L.phone.y)}px; width: ${phoneW}px; height: ${phoneH}px; box-sizing: border-box;
      border: 9px solid #15171a; border-radius: ${Math.round(phoneW * 0.13)}px; background: #15171a; overflow: hidden;
      box-shadow: 0 30px 60px rgb(0 0 0 / .32), 0 6px 14px rgb(0 0 0 / .2); }
  .phone img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; border-radius: ${Math.round(phoneW * 0.10)}px; }
  .phone::after { content: ""; position: absolute; left: 50%; top: 7px; width: 26%; height: 13px; transform: translateX(-50%); background: #15171a; border-radius: 10px; }
  .text { position: absolute; left: ${Math.round(W * L.text.x)}px; top: ${Math.round(H * L.text.y)}px; width: ${Math.round(W * L.text.w)}px; text-align: ${L.text.center ? "center" : "left"}; }
  .text .sub { font: 500 ${Math.round(W * 0.012)}px/1.3 ${pal.fontText}; letter-spacing: .12em; text-transform: uppercase; color: ${pal.accent}; margin: 0 0 ${Math.round(H * 0.02)}px; }
  .text h1 { font: 700 ${Math.round(W * (layout === "2" ? 0.048 : 0.040))}px/1.05 ${pal.fontDisplay}; margin: 0; color: ${pal.ink}; letter-spacing: -.01em; text-wrap: balance; }
  .text .line { width: ${Math.round(W * 0.05)}px; height: 4px; background: ${pal.accent}; margin: ${Math.round(H * 0.03)}px ${L.text.center ? "auto" : "0"} 0; }
</style></head><body>
<div class="glow"></div><div class="grain"></div>
<div class="laptop"><div class="screen"><img src="${dataUrl(desk)}" alt=""></div><div class="base"></div></div>
<div class="phone"><img src="${dataUrl(mob)}" alt=""></div>
<div class="text"><p class="sub">${sub}</p><h1>${caption}</h1><div class="line"></div></div>
</body></html>`;

const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const pg = await ctx.newPage();
await pg.setContent(page, { waitUntil: "networkidle" });
await pg.evaluate(() => document.fonts.ready);
await pg.waitForTimeout(400);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
await pg.screenshot({ path: outFile, type: "png" });
await browser.close();

const jpgFile = outFile.replace(/\.png$/i, ".jpg");
if (sharp) await sharp(outFile).jpeg({ quality: 90 }).toFile(jpgFile);
const kb = (f) => Math.round(fs.statSync(f).size / 1024);
console.log(`Мокап: ${outFile} (${W}×${H}, ${kb(outFile)} КБ)${sharp ? `, jpg: ${jpgFile} (${kb(jpgFile)} КБ)` : ""}`);
console.log(`Подпись: «${caption}» · ${sub} · палитра ${pal.canvas} / ${pal.accent} · макет ${layout}`);
console.log("Kwork: обложка кворка от 660×440, 30 КБ – 10 МБ, jpg/png – подходит.");
