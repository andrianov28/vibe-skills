#!/usr/bin/env node
/**
 * Упаковка сайта в один HTML-блок Тильды (T123).
 *
 *   node tilda-pack.mjs <папка сайта> [--assets <адрес папки картинок>] [--links <файл со ссылками>] [--out tilda.html] [--clip]
 *
 * --links: текстовый файл, в каждой строке ссылка на файл, загруженный в Тильду
 * (имя файла в конце ссылки должно совпадать с именем в assets/). Для сдачи заказчику
 * без зависимости от GitHub: картинки из Тильды, остальное как обычно.
 *
 * Берёт index.html, вырезает <body>-содержимое, инлайнит vibe.css и vibe.js,
 * заменяет пути assets/ на адрес картинок, убирает комментарии и лишние пробелы,
 * считает байты. Адрес картинок по умолчанию – с GitHub Pages, если сайт уже
 * опубликован (publish.mjs, файл .publish/publish.json); иначе плейсхолдер {{ASSETS}}.
 * --clip кладёт готовый код в буфер обмена, чтобы ученик сразу вставил его в Тильду.
 * Лимит блока Тильды: 100 000 байт. Шрифты подключаются в настройках сайта
 * Тильды, а не в блоке (см. references/тильда.md).
 */
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) { console.error("укажи папку сайта"); process.exit(1); }
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const pubCfg = path.join(dir, ".publish", "publish.json");
const published = fs.existsSync(pubCfg) ? JSON.parse(fs.readFileSync(pubCfg, "utf8")) : null;
let assets = arg("--assets", published?.url ? published.url + "assets/" : "{{ASSETS}}/");
if (!assets.endsWith("/")) assets += "/";
const clip = process.argv.includes("--clip");
const outFile = arg("--out", path.join(dir, "tilda.html"));
const LIMIT = 100000;

const read = (f) => fs.readFileSync(f, "utf8");
const html = read(path.join(dir, "index.html"));
const findFile = (name) => { const p = [path.join(dir, name), path.join(dir, "engine", name)].find((p) => fs.existsSync(p)); if (!p) { console.error(`в папке сайта нет ${name} (движок кладёт скилл «Вайб-сайт» рядом с index.html)`); process.exit(1); } return p; };
let css = read(findFile("vibe.css")), js = read(findFile("vibe.js"));

const minCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{}:;,>])\s*/g, "$1").replace(/;}/g, "}").trim();
const minJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/^\s+/, "").replace(/\s+\/\/.*$/, "")).filter((l) => l && !l.startsWith("//")).join("\n");

const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
let body = bodyMatch ? bodyMatch[1] : html;
// свой <style> страницы из <head>
const fonts = [...html.matchAll(/family=([A-Za-z+]+?)[:&"]/g)].map((m) => m[1].split("+").join(" ")).filter((v, i, a) => a.indexOf(v) === i);
const headStyles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
body = body.replace(/<link[^>]+vibe\.css[^>]*>/gi, "").replace(/<script[^>]+vibe\.js[^>]*><\/script>/gi, "");
body = body.replace(/<!--[\s\S]*?-->/g, "");
// плашка «Демо для заказчика» живёт только в демо, в Тильду не едет
body = body.replace(/<(div|p|a)\b[^>]*class="[^"]*\bdemo-for\b[^"]*"[^>]*>[\s\S]*?<\/\1>/g, "");
const linksFile = arg("--links", null);
const links = new Map();
if (linksFile) for (const line of fs.readFileSync(linksFile, "utf8").split(/\r?\n/)) {
  const u = line.trim(); if (!/^https?:\/\//.test(u)) continue;
  links.set(decodeURIComponent(u.split("/").pop().split("?")[0]).toLowerCase(), u);
}
if (links.size) {
  const missing = new Set();
  body = body.replace(/(["'(])\.?\/?assets\/([^"')?#]+)/g, (m, q, file) => { const u = links.get(file.toLowerCase()); if (u) return q + u; missing.add(file); return q + assets + file; });
  console.log(`Ссылки Тильды подставлены: ${links.size}${missing.size ? `. НЕ НАЙДЕНЫ в списке (остались с GitHub): ${[...missing].join(", ")}` : ""}`);
} else body = body.replace(/(["'(])\.?\/?assets\//g, "$1" + assets);
body = body.replace(/\n\s*\n/g, "\n").replace(/^\s+/gm, "");

const pack = `<!-- Вайб-сайт: HTML-блок T123. Картинки грузятся с ${assets} -->
<style>${minCss(css)}\n${minCss(headStyles)}</style>
${body}
<script>${minJs(js)}</script>`;

fs.writeFileSync(outFile, pack);
const bytes = Buffer.byteLength(pack, "utf8");
console.log(`${outFile}: ${bytes} байт (${(bytes / 1024).toFixed(1)} КБ), лимит ${LIMIT}. ${bytes > LIMIT ? "ПРЕВЫШЕН: сократи разметку (убери блок) и собери снова" : "ок"}`);
if (bytes > LIMIT) process.exit(2);
if (assets.startsWith("{{")) console.log("! Сайт не опубликован: в коде стоит {{ASSETS}}/ вместо адреса картинок. Сначала «опубликуй» (publish.mjs), потом собери код снова.");
else console.log(`Картинки: ${assets} (с GitHub Pages; пока репозиторий на месте, картинки в Тильде живут)`);
if (clip) {
  const { spawnSync } = await import("node:child_process");
  const r = process.platform === "win32"
    ? spawnSync("powershell", ["-NoProfile", "-Command", "Get-Content -Raw -Encoding UTF8 $env:VIBE_CLIP | Set-Clipboard"], { env: { ...process.env, VIBE_CLIP: outFile } })
    : process.platform === "darwin" ? spawnSync("sh", ["-c", `pbcopy < "${outFile}"`]) : { status: 1 };
  console.log(r.status === 0 ? "Код скопирован в буфер обмена." : `Не смог скопировать в буфер: открой файл ${outFile}, выдели всё (Ctrl+A) и скопируй (Ctrl+C).`);
}
console.log(`
В Тильде (4 действия):
1. Мои сайты → сайт → «Создать страницу» (пустая).
2. «+ Добавить блок» → раздел «Другое» → T123 «HTML-код». В блоке нажми «Контент».
3. Вставь код (Ctrl+V), «Сохранить и закрыть».
4. «Опубликовать» справа вверху. Открой страницу и пролистай на компьютере и телефоне.
Один раз на сайт: Настройки сайта → «Шрифты и цвета» → та же пара шрифтов, что в коде (${fonts.join(" + ") || "см. template.md"}).`);
