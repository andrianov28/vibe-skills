#!/usr/bin/env node
/**
 * Упаковка сайта в ОДИН самодостаточный HTML для публикации (артефакт, хостинг, отправка файлом).
 *
 *   node single-file.mjs <папка сайта> --data data.json --out out.html [--note "текст сноски"]
 *
 * Инлайнит vibe.css, vibe.js, свои <style>, шрифты и картинки (data: URI),
 * подставляет слоты {{...}} из JSON (значение-массив подставляется по очереди
 * в 1-е, 2-е, 3-е вхождение слота), выдаёт содержимое без <html>/<head>/<body>,
 * чтобы файл годился и для Artifact, и для обычной страницы.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.argv[2];
if (!dir) { console.error("укажи папку сайта"); process.exit(1); }
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const dataFile = arg("--data", null);
const outFile = arg("--out", path.join(dir, "single.html"));
const note = arg("--note", "");

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(f, "utf8");
const findFile = (name) => [path.join(dir, name), path.join(dir, "engine", name), path.join(here, "..", "engine", name)].find((p) => fs.existsSync(p));

const html = read(path.join(dir, "index.html"));
const MIME = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", svg: "image/svg+xml", woff2: "font/woff2", avif: "image/avif", mp4: "video/mp4" };
const cache = new Map();
const dataUri = (rel) => {
  const clean = rel.split("?")[0].split("#")[0];
  if (cache.has(clean)) return cache.get(clean);
  const file = path.join(dir, clean);
  if (!fs.existsSync(file)) { console.warn("  ! нет файла:", clean); cache.set(clean, clean); return clean; }
  const ext = path.extname(file).slice(1).toLowerCase();
  const uri = `data:${MIME[ext] || "application/octet-stream"};base64,${fs.readFileSync(file).toString("base64")}`;
  cache.set(clean, uri);
  return uri;
};
// любые ссылки вида assets/... (в html, css, js) -> data:
const inlineAssets = (s, base = "") =>
  s.replace(/(?:\.\/)?((?:\.\.\/)*)assets\/[A-Za-z0-9._\/-]+/g, (m) => dataUri(path.posix.join(base, m.replace(/^\.\//, "").replace(/^(\.\.\/)+/, ""))));

// ---- CSS: @import гугл-шрифтов, свои @font-face, движок, стили страницы
const imports = [...html.matchAll(/<link[^>]+href="(https:\/\/fonts\.googleapis\.com[^"]+)"[^>]*>/g)].map((m) => `@import url("${m[1].replace(/&amp;/g, "&")}");`);
const fontCssLinks = [...html.matchAll(/<link[^>]+href="((?:\.\/)?assets\/[^"]+\.css)"[^>]*>/g)].map((m) => m[1].replace(/^\.\//, ""));
// в css шрифтов пути относительные (url("manrope-cyrillic.woff2")): резолвим от папки самого css
const inlineCssUrls = (css, base) =>
  inlineAssets(css, base).replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (m, q, u) =>
    /^(data:|https?:|\/\/)/.test(u) ? m : `url("${dataUri(path.posix.join(base, u))}")`);
const fontCss = fontCssLinks.map((rel) => inlineCssUrls(read(path.join(dir, rel)), path.posix.dirname(rel))).join("\n");
const engineCss = read(findFile("vibe.css"));
const pageCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
const engineJs = read(findFile("vibe.js"));

// ---- BODY
const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
let body = bodyMatch ? bodyMatch[1] : html;
body = body
  .replace(/<link[^>]*>/gi, "")
  .replace(/<!--[\s\S]*?-->/g, "");
// движок встаёт ровно туда, где был <script src="vibe.js">: собственные скрипты страницы ждут Vibe
const engineTag = `<script>${engineJs}<\/script>`;
body = /<script[^>]+src="[^"]*vibe\.js"[^>]*><\/script>/i.test(body)
  ? body.replace(/<script[^>]+src="[^"]*vibe\.js"[^>]*><\/script>/gi, engineTag)
  : engineTag + body;

// собственные скрипты страницы остаются в body как есть
const titleAt = html.indexOf("<title>");
const title = titleAt > -1 ? html.slice(titleAt + 7, html.indexOf("</title>", titleAt)).trim() : "Вайб-сайт";
// --standalone: обычная страница для хостинга (свой <head>). Без флага – кусок для Artifact,
// где обёртку <html>/<head>/<body> добавляет сам артефакт.
const standalone = process.argv.includes("--standalone");
let out = `${standalone ? "" : `<title>${title}</title>\n`}<style>\n${imports.join("\n")}\n${fontCss}\n${engineCss}\n${pageCss}\n</style>\n${body}`;

// ---- слоты (до инлайна картинок: в слот может прийти путь к файлу из assets/)
if (dataFile) {
  const data = JSON.parse(read(dataFile));
  // "__replace": [["было", "стало"], ...] — точечные правки текста под конкретного клиента
  for (const [from, to] of data.__replace || []) {
    if (!out.includes(from)) console.warn("  ! не найдено для замены:", from.slice(0, 60));
    out = out.split(from).join(to);
  }
  const counters = new Map();
  out = out.replace(/\{\{([^}]+)\}\}/g, (m, key) => {
    const k = key.trim();
    if (!(k in data)) return m;
    const v = data[k];
    if (!Array.isArray(v)) return String(v);
    const i = counters.get(k) || 0;
    counters.set(k, i + 1);
    return String(v[Math.min(i, v.length - 1)]);
  });
}
out = inlineAssets(out);
const left = [...out.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1].trim());
if (left.length) console.warn("  ! незаполненные слоты:", [...new Set(left)].join(", "));

// ---- демо-режим: все кнопки работают. Якорь в другую секцию – плавный скролл с поправкой на
// фиксированную шапку; кнопка внутри своей же секции (последняя CTA, мессенджеры) – окно заявки;
// формы не уходят в никуда. В боевой сборке (без --demo) слоты ведут на реальные адреса.
if (process.argv.includes("--demo")) {
  out += `
<script>
(function () {
  var page = document.querySelector('.v-page') || document.body;
  var cs = getComputedStyle(page);
  // кавычки в именах шрифтов заменяем на одинарные: значения уходят в атрибут style="…"
  function V(n, d) { var v = (cs.getPropertyValue(n) || '').trim().replace(/"/g, "'"); return v || d; }

  function headOffset() {
    var h = 0;
    var all = document.querySelectorAll('header, .bar, .nav, [class*="bar"]');
    for (var i = 0; i < all.length; i++) {
      var el = all[i], s = getComputedStyle(el);
      if (s.position === 'fixed' && el.getBoundingClientRect().top <= 1 && el.offsetHeight < 160) {
        h = Math.max(h, el.offsetHeight);
      }
    }
    return h;
  }

  var modal = null, lastFocus = null;
  function build() {
    var ink = V('--v-ink', '#f2f2f2'), soft = V('--v-ink-soft', '#9a9a9a'), acc = V('--v-accent', '#d99a3e'),
        accInk = V('--v-accent-ink', '#141414'), surf = V('--v-surface', '#16181d'),
        fd = V('--v-font-display', 'system-ui, sans-serif'), ft = V('--v-font-text', 'system-ui, sans-serif');
    var field = 'width:100%;box-sizing:border-box;margin-top:6px;padding:12px 14px;border-radius:10px;border:1px solid rgba(128,128,128,.35);background:rgba(128,128,128,.10);color:' + ink + ';font:400 16px/1.3 ' + ft + ';outline:none';
    var label = 'display:block;font:500 13px/1.2 ' + ft + ';letter-spacing:.04em;text-transform:uppercase;color:' + soft;
    modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Оставить заявку');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.66)';
    modal.innerHTML =
      '<div data-card style="width:min(460px,100%);max-height:92vh;overflow:auto;padding:26px;border-radius:16px;background:' + surf + ';color:' + ink + ';box-shadow:0 30px 80px rgba(0,0,0,.45)">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">' +
          '<h2 data-title style="margin:0;font:600 24px/1.15 ' + fd + ';color:' + ink + '">Оставить заявку</h2>' +
          '<button data-close aria-label="Закрыть" style="flex:none;width:36px;height:36px;border-radius:50%;border:1px solid rgba(128,128,128,.35);background:transparent;color:' + ink + ';font-size:20px;line-height:1;cursor:pointer">&times;</button>' +
        '</div>' +
        '<p data-lead style="margin:10px 0 20px;font:400 15px/1.5 ' + ft + ';color:' + soft + '">Демо-макет: заявка никуда не отправляется. На боевом сайте она уходит в почту, CRM или мессенджер.</p>' +
        '<form data-demo-form>' +
          '<label style="display:block;margin-bottom:14px"><span style="' + label + '">Имя</span><input name="name" autocomplete="name" style="' + field + '"></label>' +
          '<label style="display:block;margin-bottom:20px"><span style="' + label + '">Телефон</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7" required style="' + field + '"></label>' +
          '<button data-submit type="submit" style="width:100%;padding:14px 18px;border:0;border-radius:10px;background:' + acc + ';color:' + accInk + ';font:600 16px/1 ' + ft + ';cursor:pointer">Отправить</button>' +
        '</form>' +
        '<p data-done hidden style="margin:18px 0 0;font:500 16px/1.5 ' + ft + ';color:' + ink + '">Спасибо, заявка принята. В демо-макете она никуда не ушла.</p>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal || e.target.hasAttribute('data-close')) close(); });
    modal.querySelector('[data-demo-form]').addEventListener('submit', function (e) {
      e.preventDefault();
      this.hidden = true;
      modal.querySelector('[data-done]').hidden = false;
      setTimeout(close, 2200);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.style.display === 'flex') close(); });
  }
  function open(title, lead) {
    if (!modal) build();
    var f = modal.querySelector('[data-demo-form]'), done = modal.querySelector('[data-done]');
    f.hidden = false; f.reset(); done.hidden = true;
    modal.querySelector('[data-lead]').textContent = lead ||
      'Демо-макет: заявка никуда не отправляется. На боевом сайте она уходит в почту, CRM или мессенджер.';
    if (title) {
      modal.querySelector('[data-title]').textContent = title;
      modal.querySelector('[data-submit]').textContent = title === 'Позвонить' ? 'Перезвоните мне' : 'Отправить заявку';
    }
    lastFocus = document.activeElement;
    modal.style.display = 'flex';
    var input = modal.querySelector('input[name=phone]');
    if (input) setTimeout(function () { input.focus(); }, 30);
  }
  function close() {
    if (!modal) return;
    modal.style.display = 'none';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // ссылки-якоря: внутренняя навигация вместо родного перехода (в артефакте и в Тильде надёжнее)
  document.querySelectorAll('a[href^="#"][target]').forEach(function (a) { a.removeAttribute('target'); });
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    // на компьютере tel: обычно ничего не открывает: показываем номер и форму, на телефоне звоним как обычно
    if (href.indexOf('tel:') === 0) {
      if (!window.matchMedia('(pointer: coarse)').matches) {
        e.preventDefault();
        open('Позвонить', 'Демо-макет. На боевом сайте это звонок на ' + href.slice(4) + '. Можно оставить номер, перезвоним.');
      }
      return;
    }
    if (href.charAt(0) !== '#') return;
    e.preventDefault();
    var id = href.slice(1);
    var t = id ? document.getElementById(id) : null;
    if (!t || t.contains(a)) { open((a.textContent || '').trim().slice(0, 40)); return; }
    var y = window.scrollY + t.getBoundingClientRect().top - headOffset() - 4;
    y = Math.max(0, y);
    var far = Math.abs(y - window.scrollY) > window.innerHeight * 4;
    window.scrollTo({ top: y, behavior: far ? 'auto' : 'smooth' });
  });

  // формы страницы: показываем ответ на месте, ничего не отправляем
  document.querySelectorAll('form').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      var note = f.querySelector('.book__note, [class$="__note"], p');
      if (note) note.textContent = 'Спасибо, заявка принята. Демо-макет: она никуда не ушла, на боевом сайте здесь ваш обработчик заявок.';
      var btn = f.querySelector('button[type=submit], button');
      if (btn) btn.textContent = 'Готово';
    }, true);
  });
})();
</script>`;
}

if (note) {
  out += `\n<p style="margin:0;padding:14px 20px;text-align:center;font:400 13px/1.5 system-ui,sans-serif;background:#111;color:#8b8b8b">${note}</p>`;
}

if (standalone) {
  // описание, иконка и og берём из исходного <head>, слоты в них подставляем теми же данными
  const headSrc = html.slice(0, html.indexOf("</head>") + 1);
  const pick = (re) => (headSrc.match(re) || [""])[0];
  const data = dataFile ? JSON.parse(read(dataFile)) : {};
  const fill = (s) => (data.__replace || []).reduce((acc, [from, to]) => acc.split(from).join(to), s)
    .replace(/\{\{([^}]+)\}\}/g, (m, k) => {
    const v = data[k.trim()];
    return v === undefined ? "" : String(Array.isArray(v) ? v[0] : v);
  });
  const ogBase = arg("--og-base", "");
  const desc = fill(pick(/<meta name="description"[^>]*>/i));
  const icon = pick(/<link rel="icon"[^>]*>/i);
  const ogTitle = fill(pick(/<meta property="og:title"[^>]*>/i)) || `<meta property="og:title" content="${title}">`;
  const ogDesc = fill(pick(/<meta property="og:description"[^>]*>/i));
  const ogImg = ogBase ? `<meta property="og:image" content="${ogBase.replace(/\/$/, "")}/og.jpg">` : "";
  out = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
${desc}
${icon}
<meta property="og:type" content="website">
<meta property="og:locale" content="ru_RU">
${ogTitle}
${ogDesc}
${ogImg}
${ogBase ? `<meta name="twitter:card" content="summary_large_image">` : ""}
<meta name="robots" content="noindex">
</head>
<body>
${out}
</body>
</html>`;
}

fs.writeFileSync(outFile, out);
const bytes = Buffer.byteLength(out, "utf8");
console.log(`${outFile}: ${(bytes / 1024 / 1024).toFixed(2)} МБ (лимит артефакта 16 МБ)`);
