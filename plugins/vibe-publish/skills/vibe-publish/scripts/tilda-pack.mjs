#!/usr/bin/env node
/**
 * Упаковка сайта в один HTML-блок Тильды (T123).
 *
 *   node tilda-pack.mjs <папка сайта> [--tilda <адрес страницы Тильды>] [--assets <адрес папки картинок>] [--links <файл со ссылками>] [--out tilda.html] [--clip]
 *
 * --tilda: сдача без GitHub (с 02.10.2026). Ученик загрузил картинки сайта галереей на страницу
 * Тильды и опубликовал её. Скрипт сам читает опубликованную страницу, берёт ссылки static.tildacdn.*
 * по именам файлов из assets/, подставляет их в код, скрывает галерею (display:none, файлы остаются
 * в Тильде) и переводит свои шрифты каркаса (@font-face из assets/fonts) на Google Fonts.
 * Итог: код без единой ссылки на GitHub.
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
const auto = process.argv.includes("--auto"); // автоперенос через Claude в Chrome: ручную инструкцию не печатать
const tildaPage = arg("--tilda", null);
// ссылки на картинки из Тильды: имя файла (маленькими) → адрес на static.tildacdn.*
const links = new Map();
const galleryRecs = new Set();
if (tildaPage) {
  let page;
  try { const r = await fetch(tildaPage, { headers: { "cache-control": "no-cache" } }); if (!r.ok) throw new Error("ответ " + r.status); page = await r.text(); }
  catch (e) { console.error(`Не открыл страницу Тильды ${tildaPage}: ${e.message}. Страница опубликована? Адрес скопирован целиком?`); process.exit(1); }
  for (const m of page.matchAll(/https?:\/\/static\.tildacdn\.[a-z]+\/tild[0-9a-f-]+\/([^"'\s)<>?#]+)/gi)) links.set(decodeURIComponent(m[1]).toLowerCase(), m[0].replace(/^http:/, "https:"));
  // галерея с картинками – любая запись страницы с загруженными картинками, кроме блоков HTML-кода (T123 = data-record-type 131)
  const recs = [...page.matchAll(/<div id="(rec\d+)"[^>]*data-record-type="(\d+)"/g)].map((m) => ({ id: m[1], type: m[2], at: m.index }));
  recs.forEach((r, i) => { const chunk = page.slice(r.at, recs[i + 1] ? recs[i + 1].at : page.length); if (r.type !== "131" && /static\.tildacdn\.[a-z]+\/tild/.test(chunk)) galleryRecs.add(r.id); });
  if (!links.size) { console.error("На странице Тильды нет загруженных картинок. Добавь галерею, загрузи в неё файлы из папки assets сайта, опубликуй страницу и запусти снова."); process.exit(1); }
}
const outFile = arg("--out", path.join(dir, "tilda.html"));
const LIMIT = 100000;

const read = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n"); // файлы с Windows могут прийти с CRLF
const html = read(path.join(dir, "index.html"));
const findFile = (name) => { const p = [path.join(dir, name), path.join(dir, "engine", name)].find((p) => fs.existsSync(p)); if (!p) { console.error(`в папке сайта нет ${name} (его кладёт скилл «Вайб-сайт» рядом с index.html)`); process.exit(1); } return p; };
const isLocal = (u) => !/^(?:[a-z]+:|\/\/)/i.test(u);
const missing = new Set();
const assetUrl = (file) => { if (links.size) { const u = links.get(file.toLowerCase()); if (u) return u; if (!/^fonts\//.test(file)) missing.add(file); } return assets + file; };
const toAssets = (s) => s.replace(/(["'(])\.?\/?assets\/([^"')?#\s]+)/g, (m, q, file) => q + assetUrl(file));
// url(...) в подключённом css считаются от папки самого css: assets/fonts/fonts.css → assets/fonts/x.woff2
const cssUrls = (s, base) => s.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (m, q, u) => {
  if (!isLocal(u) || u.startsWith("#")) return m;
  const rel = path.posix.normalize(path.posix.join(base, u));
  return rel.startsWith("assets/") ? `url(${q}${assetUrl(rel.slice(7))}${q})` : m;
});
// Что подключает страница. Каркасы: движок vibe.css + vibe.js. Сайты «по номеру» из Галереи 45:
// assets/fonts/fonts.css + style-*.css + style.js (до 01.10.2026 они в блок не попадали – страница без оформления)
// Стили – в порядке страницы (свои <style> и подключённые файлы вперемешку: палитра в <style> стоит между fonts.css и style-*.css), движок vibe.css – первым, как раньше.
const sheetHref = (t) => /\brel="?stylesheet/i.test(t) && ((t.match(/\bhref="([^"]+)"/i) || [])[1] || "");
const styleSeq = [...html.matchAll(/<link\b[^>]*>|<style[^>]*>([\s\S]*?)<\/style>/gi)]
  .map((m) => /^<style/i.test(m[0]) ? { style: m[1] } : { file: sheetHref(m[0]) })
  .filter((x) => x.style !== undefined || (x.file && isLocal(x.file)))
  .map((x) => x.file ? { file: x.file.replace(/^\.\//, "") } : x);
const localJs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/gi)].map((m) => m[1]).filter(isLocal).map((u) => u.replace(/^\.\//, ""));
if (!styleSeq.some((x) => x.file) && !localJs.length) styleSeq.unshift({ file: "vibe.css" }), localJs.push("vibe.js");
let css = "", js = "";
const extraCss = [], afterJs = [];
for (const x of styleSeq) {
  if (x.style !== undefined) { extraCss.push(toAssets(x.style)); continue; }
  const s = cssUrls(read(findFile(x.file)), path.posix.dirname(x.file));
  if (x.file === "vibe.css") css = s; else extraCss.push(s);
}
// движок – до разметки (как раньше), остальные скрипты (style.js ищет разметку сразу) – после неё
for (const f of localJs) { const s = read(findFile(f)); if (f === "vibe.js") js = s; else afterJs.push(s); }

const minCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{}:;,>])\s*/g, "$1").replace(/;}/g, "}").trim();
const minJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).map((l) => l.replace(/^\s+/, "").replace(/\s+\/\/.*$/, "")).filter((l) => l && !l.startsWith("//")).join("\n");

const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
let body = bodyMatch ? bodyMatch[1] : html;
// атрибуты <body> сайта (контакты data-wa/data-tg/data-max, палитры, класс стиля, id="top") в Тильде иначе теряются:
// у страницы Тильды свой <body>. Переносим их на него первым скриптом блока (кнопка WhatsApp без номера – найдено 02.10.2026)
const bodyAttrs = {};
for (const m of ((html.match(/<body\b([^>]*)>/i) || [])[1] || "").matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) bodyAttrs[m[1]] = (m[2] ?? m[3] ?? m[4] ?? "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const bodyScript = Object.keys(bodyAttrs).length ? `<script>((b,a)=>{for(const k in a){if(k==="class")b.classList.add(...a[k].split(/\\s+/).filter(Boolean));else if(k==="id"){if(!b.id)b.id=a[k]}else b.setAttribute(k,a[k])}})(document.body,${JSON.stringify(bodyAttrs).replace(/</g, "\\u003c")})</script>\n` : "";
// свой <style> страницы из <head>
const fonts = [...html.matchAll(/family=([A-Za-z+]+?)[:&"]/g)].map((m) => m[1].split("+").join(" ")).filter((v, i, a) => a.indexOf(v) === i);
// ссылка Google Fonts из <head> едет в блок как @import (первой строкой стилей): шрифты подключаются сами, без настроек Тильды
const fontLinks = [...html.matchAll(/<link[^>]+href="(https:\/\/fonts\.googleapis\.com\/css2?[^"]+)"/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
// свои шрифты каркаса (@font-face url(assets/fonts/…)) тоже едут с GitHub Pages, иначе в Тильде 404 (найдено 16.09.2026 на каркасе mebel)
let headStyles = extraCss.join("\n");
// режим «без GitHub»: свои шрифты (@font-face с файлами из assets/fonts) → Google Fonts. Все шрифты каркасов взяты из Google Fonts
if (links.size) {
  const fam = new Map();
  const grab = (s) => s.replace(/@font-face\s*{([^}]*)}/g, (m, b) => {
    const name = ((b.match(/font-family:\s*["']?([^"';]+)/) || [])[1] || "").trim(); if (!name) return m;
    const w = (b.match(/font-weight:\s*([^;]+)/) || [, "400"])[1].trim().split(/\s+/).map(Number);
    const ital = /font-style:\s*italic/.test(b) ? 1 : 0;
    const set = fam.get(name) || new Set(); for (let x = w[0]; x <= (w[1] || w[0]); x += 100) set.add(ital + "," + x); fam.set(name, set);
    return "";
  });
  headStyles = grab(headStyles); css = grab(css);
  if (fam.size) {
    const q = [...fam].map(([name, set]) => {
      const v = [...set].map((x) => x.split(",").map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      return "family=" + name.replace(/ /g, "+") + (v.some((x) => x[0]) ? ":ital,wght@" + v.map((x) => x.join(",")).join(";") : ":wght@" + v.map((x) => x[1]).join(";"));
    }).join("&");
    fontLinks.push(`https://fonts.googleapis.com/css2?${q}&display=swap`);
    for (const n of fam.keys()) if (!fonts.includes(n)) fonts.push(n);
    console.log("Свои шрифты переведены на Google Fonts: " + [...fam.keys()].join(", "));
  }
}
// свои шрифты стилей «по номеру» (fonts.css с @font-face) – для подсказки в конце
if (/@font-face/.test(headStyles)) for (const m of headStyles.matchAll(/@font-face\s*{[^}]*?font-family:\s*['"]?([^'";]+)/g)) if (!fonts.includes(m[1])) fonts.push(m[1]);
// подключения локальных стилей и скриптов из разметки убираем: их содержимое уже в блоке
body = body.replace(/<link\b[^>]*>/gi, (t) => (sheetHref(t) && isLocal(sheetHref(t)) ? "" : t)).replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/gi, (t, u) => (isLocal(u) ? "" : t));
body = body.replace(/<!--[\s\S]*?-->/g, "");
// плашка «Демо для заказчика» живёт только в демо, в Тильду не едет
body = body.replace(/<(div|p|a)\b[^>]*class="[^"]*\bdemo-for\b[^"]*"[^>]*>[\s\S]*?<\/\1>/g, "");
const fontImport = fontLinks.map((u) => `@import url("${u}");`).join("");
const linksFile = arg("--links", null);
if (linksFile) for (const line of fs.readFileSync(linksFile, "utf8").split(/\r?\n/)) {
  const u = line.trim(); if (!/^https?:\/\//.test(u)) continue;
  links.set(decodeURIComponent(u.split("/").pop().split("?")[0]).toLowerCase(), u);
}
body = toAssets(body);
// srcset: несколько адресов через запятую
body = body.replace(/(srcset="[^"]*")/g, (m) => m.replace(/(^|[\s,"])\.?\/?assets\/([^\s,"]+)/g, (x, p, file) => p + assetUrl(file)));
body = body.replace(/\n\s*\n/g, "\n").replace(/^\s+/gm, "");

const hideGallery = [...galleryRecs].map((id) => `#${id}{display:none!important}`).join("");
const pack = `<!-- Вайб-сайт: HTML-блок T123. Картинки: ${links.size ? "из Тильды" : assets} -->
<style>${fontImport}${minCss(css)}\n${minCss(headStyles)}${hideGallery}</style>
${bodyScript}${js ? `<script>${minJs(js)}</script>\n` : ""}${body}${afterJs.length ? `\n<script>${minJs(afterJs.join("\n"))}</script>` : ""}`;
// движок стоит ДО разметки, style.js – ПОСЛЕ (он сразу ищет элементы): вызов Vibe.mount внутри разметки выполняется сразу, как Тильда вставит блок (проверено в живой Тильде 11.09.2026)

fs.writeFileSync(outFile, pack);
const bytes = Buffer.byteLength(pack, "utf8");
console.log(`${outFile}: ${bytes} байт (${(bytes / 1024).toFixed(1)} КБ), лимит ${LIMIT}. ${bytes > LIMIT ? "ПРЕВЫШЕН: сократи разметку (убери блок) и собери снова" : "ок"}`);
if (bytes > LIMIT) process.exit(2);
const github = [...new Set([...pack.matchAll(/https?:\/\/[^\s"'()<>]*github[^\s"'()<>]*/gi)].map((m) => m[0]))];
if (links.size) {
  console.log(`Картинки из Тильды: ${links.size} на странице${galleryRecs.size ? `, галерея скрыта (${[...galleryRecs].join(", ")})` : ""}.`);
  if (missing.size) console.log(`! НЕ ЗАГРУЖЕНЫ в Тильду (пока грузятся с GitHub): ${[...missing].join(", ")}. Догрузи их в ту же галерею, опубликуй страницу и собери код снова.`);
  else if (github.length) console.log(`! В коде остались ссылки на GitHub: ${github.join(", ")}`);
  else console.log("Ссылок на GitHub в коде нет: страница в Тильде живёт сама, репозиторий можно удалить.");
} else if (assets.startsWith("{{")) console.log("! Сайт не опубликован: в коде стоит {{ASSETS}}/ вместо адреса картинок. Сначала «опубликуй» (publish.mjs), потом собери код снова.");
else console.log(`Картинки: ${assets} (с GitHub Pages; пока репозиторий на месте, картинки в Тильде живут)`);
if (clip) {
  const { spawnSync } = await import("node:child_process");
  const r = process.platform === "win32"
    ? spawnSync("powershell", ["-NoProfile", "-Command", "Get-Content -Raw -Encoding UTF8 $env:VIBE_CLIP | Set-Clipboard"], { env: { ...process.env, VIBE_CLIP: outFile } })
    : process.platform === "darwin" ? spawnSync("sh", ["-c", `pbcopy < "${outFile}"`]) : { status: 1 };
  console.log(r.status === 0 ? "Код скопирован в буфер обмена." : `Не смог скопировать в буфер: открой файл ${outFile}, выдели всё (Ctrl+A) и скопируй (Ctrl+C).`);
}
if (!auto) console.log(`
В Тильде (4 действия):
1. Мои сайты → «Редактировать сайт» → «Создать новую страницу» → «Пустая страница» → «Выбрать».
2. Внизу «Все блоки» → раздел «Другое» → T123 «HTML-код» (клик – блок встанет на страницу). Навести на блок → «Контент».
3. Кликнуть в поле кода, вставить (Ctrl+V), «Сохранить и закрыть».
4. «Опубликовать» справа вверху → ссылка вида имя.tilda.ws. Открыть и пролистать на компьютере и телефоне.
${tildaPage ? "Галерею с картинками со страницы НЕ удалять: она скрыта, а картинки сайта живут в ней.\n" : ""}Шрифты (${fonts.join(" + ") || "из template.md"}) подключены внутри блока, в настройках Тильды ничего выбирать не надо.
Первый раз: Тильда попросит подтвердить телефон и почту, без этого блок HTML-кода не открывается.`);
