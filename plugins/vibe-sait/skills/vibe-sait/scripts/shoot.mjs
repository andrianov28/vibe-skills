#!/usr/bin/env node
/**
 * Проверка скролл-страницы скриншотами (Playwright + установленный Chrome).
 *
 *   node shoot.mjs --url http://localhost:4600/ --out lab/desktop [--width 1440 --height 900] [--steps 6] [--reduced]
 *
 * Что делает: идёт по каждому акту (data-v-act) в N позициях, снимает экран,
 * и пишет report.json: горизонтальный переполнение, реплики, которые ни разу
 * не дошли до полной видимости, ошибки консоли и упавшие запросы.
 * Потом ОБЯЗАТЕЛЬНО смотри кадры глазами: композицию машина не оценит.
 */
import fs from "node:fs";
import path from "node:path";
import { requireFromBuild, findChrome } from "./vibe-env.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const url = arg("--url"); const out = arg("--out", "lab/shots");
const width = +arg("--width", 1440), height = +arg("--height", 900), steps = +arg("--steps", 6);
const reduced = process.argv.includes("--reduced");
if (!url) { console.error("нужен --url"); process.exit(1); }

const pw = requireFromBuild("playwright-core");
if (!pw) { console.error("не найден playwright-core: запусти node setup.mjs (папка сборки ~/.vibe/build)"); process.exit(1); }
const chrome = findChrome();
if (!chrome) { console.error("Chrome не найден, установи Google Chrome или задай VIBE_CHROME"); process.exit(1); }

fs.rmSync(out, { recursive: true, force: true }); // старые кадры прошлого прогона не смешивать с новыми
fs.mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch({ executablePath: chrome, headless: true });
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: reduced ? "reduce" : "no-preference", isMobile: width < 768, hasTouch: width < 768 });
const page = await ctx.newPage();
const consoleErrors = [], failed = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("requestfailed", (r) => failed.push(r.url()));
page.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url()); });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(600);

const acts = await page.evaluate(() => (window.Vibe ? window.Vibe.state() : []));
const styled = !acts.length && await page.evaluate(() => !!document.querySelector(".s-hero, .s-steps, [data-s-msg], .s-price"));
if (!acts.length && !styled) console.warn("Vibe.state() пустой: движок не смонтирован?");
if (styled) console.log("страница стиля Лайт/Продающий (без движка Кино): идём экран за экраном");
const shots = []; let n = 0;
const snap = async (label) => {
  const f = path.join(out, String(n++).padStart(2, "0") + "-" + label + ".png");
  await page.screenshot({ path: f }); shots.push(f);
};
await snap("top");
if (styled) { // стили Лайт/Продающий: полная прокрутка с паузами, чтобы .s-reveal успели показаться
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = Math.round(height * 0.85);
  for (let y = step, k = 1; y < total; y += step, k++) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(450);
    await snap("screen" + String(k).padStart(2, "0"));
  }
  const msg = await page.$("[data-s-msg], .s-form button[type=submit], .s-calc button");
  if (msg) { await msg.scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(300); await snap("widget"); }
}
for (const a of acts) {
  const travel = a.type === "flow" ? a.h : Math.max(a.h - height, 1);
  const start = a.type === "flow" ? a.top - height * 0.6 : a.top;
  for (let s = 0; s <= steps; s++) {
    const y = Math.max(0, Math.round(start + (travel * s) / steps));
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(140);
    await snap(`act${a.i}-${a.type}-p${(s / steps).toFixed(2)}`);
  }
}
const overflow = await page.evaluate(() => {
  const iw = window.innerWidth, sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const wide = []; // кто вылезает за правый край
  for (const el of document.querySelectorAll("body *")) { const r = el.getBoundingClientRect(); if (r.width && r.right > iw + 1 && getComputedStyle(el).position !== "fixed") { wide.push((el.className && typeof el.className === "string" ? el.tagName.toLowerCase() + "." + el.className.split(" ")[0] : el.tagName.toLowerCase()) + " +" + Math.round(r.right - iw) + "px"); if (wide.length >= 5) break; } }
  return { sw, iw, wide };
});
const final = await page.evaluate(() => (window.Vibe ? window.Vibe.state() : []));
const neverPeaked = [];
final.forEach((a) => a.cues.forEach((c) => { if (c.peak < 0.98) neverPeaked.push({ act: a.i, text: c.text, peak: +c.peak.toFixed(2) }); }));
const report = { url, width, height, reduced, acts: final.map((a) => ({ i: a.i, type: a.type, h: Math.round(a.h) })), horizontalOverflow: overflow.sw > overflow.iw || overflow.wide.length ? overflow : null, cuesNeverPeaked: neverPeaked, consoleErrors, failedRequests: failed, shots };
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ shots: shots.length, horizontalOverflow: report.horizontalOverflow, cuesNeverPeaked: neverPeaked.length, consoleErrors: consoleErrors.length, failedRequests: failed.length }, null, 2));
await browser.close();
