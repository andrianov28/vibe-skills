#!/usr/bin/env node
/**
 * Мини-сервер для проверки сайта: node serve.mjs --root <папка> --port 4600
 * Отдаёт статику, движок подхватывает из папки скилла, если в папке сайта его нет.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const root = path.resolve(arg("--root", ".")); const port = +arg("--port", 4600);
const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "engine");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2", ".ico": "image/x-icon" };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  let f = path.join(root, p);
  if (!fs.existsSync(f) && /vibe\.(css|js)$/.test(p)) f = path.join(engine, path.basename(p));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("404 " + p); return; }
  res.writeHead(200, { "Content-Type": types[path.extname(f).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}/  ←  ${root}`));
