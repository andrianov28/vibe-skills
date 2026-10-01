/**
 * Запись прокрутки сайта в телефоне – кадр за кадром, точно под сетку музыки.
 *
 * recordScroll({ site, keys, duration, out, fps }) – keys: [{ t, y }] (секунды от начала записи
 * и прокрутка в css-пикселях). Между ключами – плавный разгон и торможение, на ключе – стоим.
 * Каждый кадр: прокрутить живую страницу, дождаться двух кадров отрисовки, снять окно 390×844 (×2).
 * Скролл-сцены, появления блоков, закреплённая шапка и кнопки снизу – всё как у настоящего человека.
 * Кадры склеиваются в MP4 своим FFmpeg (из пакета).
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { requireFromVideo, findChrome, ffmpegBin } from "./env.mjs";

const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
export function scrollAt(keys, t) {
  // keys: [{t, y, move}] – move: длительность подъезда к этой точке
  let y = keys[0].y;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i], start = k.t - k.move;
    if (t >= k.t) { y = k.y; continue; }
    if (t > start) { y = keys[i - 1].y + (k.y - keys[i - 1].y) * ease((t - start) / k.move); }
    break;
  }
  return y;
}

export async function recordScroll({ site, keys, duration, out, fps = 30, width = 390, height = 844, dpr = 2 }) {
  const dir = path.resolve(site);
  const pw = requireFromVideo("playwright-core");
  const chrome = findChrome();
  if (!pw || !chrome) throw new Error("нет playwright-core или Chrome: скажи «настрой видео»");
  const types = { html: "text/html; charset=utf-8", css: "text/css", js: "text/javascript", webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", woff2: "font/woff2", woff: "font/woff", json: "application/json", mp4: "video/mp4" };
  const server = http.createServer((req, res) => {
    let p; try { p = path.join(dir, decodeURIComponent(req.url.split("?")[0])); } catch { res.writeHead(400); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
    if (!p.startsWith(dir) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": types[path.extname(p).slice(1).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(p).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await pw.chromium.launch({ executablePath: chrome, headless: true });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "html, body { scroll-behavior: auto !important; } ::-webkit-scrollbar { display: none; }" });
  // прогрев: пролистать страницу, чтобы подгрузились картинки, и вернуться к началу
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += 400) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(60); }
  await page.evaluate((v) => window.scrollTo(0, v), keys[0].y);
  await page.waitForTimeout(1200);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const ff = spawn(ffmpegBin(), ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", "-preset", "medium", "-r", String(fps), "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => { ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg: код " + c)))); });
  const frames = Math.round(duration * fps);
  let lastY = -1;
  for (let f = 0; f < frames; f++) {
    const y = Math.round(scrollAt(keys, f / fps));
    if (y !== lastY) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      lastY = y;
    }
    const buf = await page.screenshot({ type: "jpeg", quality: 90 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % 60 === 0) process.stdout.write(`\r  запись прокрутки: ${f}/${frames} кадров`);
  }
  ff.stdin.end();
  await done;
  process.stdout.write(`\r  запись прокрутки: ${frames}/${frames} кадров ✓\n`);
  await browser.close();
  server.close();
  return out;
}
