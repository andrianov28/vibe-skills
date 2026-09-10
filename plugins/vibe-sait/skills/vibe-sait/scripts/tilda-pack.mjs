#!/usr/bin/env node
/**
 * Упаковка сайта в один HTML-блок Тильды (T123).
 *
 *   node tilda-pack.mjs <папка сайта> [--assets https://static.tildacdn.com/.../] [--out tilda.html]
 *
 * Берёт index.html, вырезает <body>-содержимое, инлайнит vibe.css и vibe.js,
 * заменяет пути assets/ на базовый URL картинок (по умолчанию плейсхолдер
 * {{ASSETS}}), убирает комментарии и лишние пробелы, считает байты.
 * Лимит блока Тильды: 100 000 байт. Шрифты подключаются в настройках сайта
 * Тильды, а не в блоке (см. references/тильда.md).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.argv[2];
if (!dir) { console.error("укажи папку сайта"); process.exit(1); }
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const assets = arg("--assets", "{{ASSETS}}/");
const outFile = arg("--out", path.join(dir, "tilda.html"));
const LIMIT = 100000;

const read = (f) => fs.readFileSync(f, "utf8");
const html = read(path.join(dir, "index.html"));
const findFile = (name) => [path.join(dir, name), path.join(dir, "engine", name), path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "engine", name)].find((p) => fs.existsSync(p));
let css = read(findFile("vibe.css")), js = read(findFile("vibe.js"));

const minCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{}:;,>])\s*/g, "$1").replace(/;}/g, "}").trim();
const minJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/^\s+/, "").replace(/\s+\/\/.*$/, "")).filter((l) => l && !l.startsWith("//")).join("\n");

const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
let body = bodyMatch ? bodyMatch[1] : html;
// свой <style> страницы из <head>
const headStyles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
body = body.replace(/<link[^>]+vibe\.css[^>]*>/gi, "").replace(/<script[^>]+vibe\.js[^>]*><\/script>/gi, "");
body = body.replace(/<!--[\s\S]*?-->/g, "");
// плашка «Демо для заказчика» живёт только в демо, в Тильду не едет
body = body.replace(/<(div|p|a)\b[^>]*class="[^"]*\bdemo-for\b[^"]*"[^>]*>[\s\S]*?<\/\1>/g, "");
body = body.replace(/(["'(])\.?\/?assets\//g, "$1" + assets);
body = body.replace(/\n\s*\n/g, "\n").replace(/^\s+/gm, "");

const pack = `<!-- Вайб-сайт: HTML-блок T123. Картинки: замени ${assets} на адрес папки с файлами в Тильде. -->
<style>${minCss(css)}\n${minCss(headStyles)}</style>
${body}
<script>${minJs(js)}</script>`;

fs.writeFileSync(outFile, pack);
const bytes = Buffer.byteLength(pack, "utf8");
console.log(`${outFile}: ${bytes} байт (${(bytes / 1024).toFixed(1)} КБ), лимит ${LIMIT}. ${bytes > LIMIT ? "ПРЕВЫШЕН, режь картинки в base64 или разметку" : "ок"}`);
if (bytes > LIMIT) process.exit(2);
