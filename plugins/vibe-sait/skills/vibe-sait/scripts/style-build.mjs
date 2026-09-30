#!/usr/bin/env node
/**
 * Сборка сайта ниши во втором и третьем стиле галереи («Лайт», «Продающий»).
 * Первый стиль («Кино») – это сам каркас templates/<ниша>/index.html, его собирает обычный путь скилла.
 *
 *   node style-build.mjs <ниша> <lite|prod> <папка-результата> [--assets <папка с картинками>] [--palette А|Б|В]
 *        [--content <свой styles.json>] [--gallery]
 *
 * Контент берётся из templates/<ниша>/styles.json (тексты, цены, шаги, калькулятор или запись),
 * палитры А/Б/В – из таблицы в templates/<ниша>/template.md, шрифты – из <head> каркаса index.html.
 * Картинки: из --assets (по умолчанию <папка-результата>/assets, если уже есть). Имена – как в styles.json.
 * --gallery: на странице работает переключатель палитр ?p=А|Б|В (для галереи), в боевом сайте не нужен.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.resolve(here, "..");
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null; };
const [slug, style, outArg] = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && ["--assets", "--palette", "--content"].includes(argv[i - 1])));
if (!slug || !["lite", "prod"].includes(style) || !outArg) {
  console.error("node style-build.mjs <ниша> <lite|prod> <папка-результата> [--assets <папка>] [--palette А|Б|В] [--content <json>] [--gallery]");
  process.exit(1);
}
const tdir = path.join(skill, "templates", slug);
const out = path.resolve(outArg);
const contentFile = flag("--content") ? path.resolve(flag("--content")) : path.join(tdir, "styles.json");
if (!fs.existsSync(contentFile)) { console.error("нет " + contentFile); process.exit(1); }
const C = JSON.parse(fs.readFileSync(contentFile, "utf8"));
const md = fs.readFileSync(path.join(tdir, "template.md"), "utf8");
const cinema = fs.readFileSync(path.join(tdir, "index.html"), "utf8");
const gallery = argv.includes("--gallery");

// ---- палитры из template.md: строки «| `--v-canvas` | `#…` | `#…` | `#…` |»
const VARS = ["canvas", "surface", "ink", "ink-soft", "accent", "accent-ink"];
const OPT = ["accent-deep"]; // необязательный: тёмный оттенок акцента для мелкого текста на светлом фоне
const palettes = { "А": {}, "Б": {}, "В": {} };
for (const line of md.split(/\r?\n/)) {
  const m = line.match(/^\|\s*`--v-([a-z-]+)`\s*\|(.*)$/);
  if (!m || !(VARS.includes(m[1]) || OPT.includes(m[1]))) continue;
  const hexes = [...m[2].matchAll(/#[0-9a-fA-F]{6}\b/g)].map((x) => x[0]);
  ["А", "Б", "В"].forEach((k, i) => { if (hexes[i]) palettes[k][m[1]] = hexes[i]; });
}
const names = {};
const head = md.split(/\r?\n/).find((l) => /^\|\s*Переменная/.test(l)) || "";
head.split("|").slice(2).map((s) => s.trim()).filter(Boolean).forEach((cell) => {
  const k = (cell.match(/^([АБВ])/) || [])[1]; if (!k) return;
  names[k] = (cell.match(/«([^»]+)»/) || [])[1] || cell.replace(/\([^)]*\)/g, "").replace(/`/g, "").replace(/^[АБВ]\s*[·:]?\s*/, "").replace(/^[:·\s]+/, "").trim();
});
for (const k of Object.keys(palettes)) { if (VARS.some((v) => !palettes[k][v])) delete palettes[k]; else if (!palettes[k]["accent-deep"]) palettes[k]["accent-deep"] = palettes[k].accent; }
if (!palettes["А"]) { console.error("не нашёл палитру А в template.md"); process.exit(1); }
const pal = palettes[flag("--palette") || "А"] || palettes["А"];

// ---- шрифты: ссылки из <head> каркаса и имена семейств
const headHtml = cinema.slice(0, cinema.indexOf("</head>"));
const fontLinks = [...headHtml.matchAll(/<link[^>]+>/g)].map((m) => m[0])
  .filter((l) => /fonts\.googleapis|fonts\.gstatic|assets\/fonts/.test(l)).join("\n");
const fontFaces = [...headHtml.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]).join("\n");
const fam = (v) => ((cinema.match(new RegExp("--v-font-" + v + ":\\s*([^;]+);")) || [])[1] || "system-ui, sans-serif").trim();
const fDisplay = fam("display"), fText = fam("text");

// ---- картинки и шрифты в папку результата
fs.mkdirSync(path.join(out, "assets"), { recursive: true });
const assetsFrom = flag("--assets") ? path.resolve(flag("--assets")) : null;
const need = new Set((C.photos || []).map((p) => p.img).filter(Boolean));
if (C.hero && C.hero.img) need.add(C.hero.img);
// в галерее – убрать из assets картинки, которых больше нет в styles.json (сменили hero и т.п.)
if (assetsFrom && gallery) for (const f of fs.readdirSync(path.join(out, "assets"))) if (/.(webp|jpe?g|png)$/i.test(f) && !need.has(f)) fs.rmSync(path.join(out, "assets", f));
if (assetsFrom) for (const f of need) {
  const src = path.join(assetsFrom, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, "assets", f)); else console.log("○ нет картинки " + f + " в " + assetsFrom);
}
const fontsDir = path.join(tdir, "assets", "fonts");
if (fs.existsSync(fontsDir)) fs.cpSync(fontsDir, path.join(out, "assets", "fonts"), { recursive: true });
for (const f of ["style-lite.css", "style-prod.css", "style.js"]) fs.copyFileSync(path.join(skill, "templates", "_styles", f), path.join(out, f));

// ---- утилиты разметки
// неразрывный пробел перед коротким тире: тире не уезжает в начало строки
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ – /g, " – ");
const attr = (s) => esc(s).replace(/"/g, "&quot;");
const rub = (v) => typeof v === "number" ? v.toLocaleString("ru-RU").replace(/[   ]/g, " ") + " ₽" : esc(v);
const priceCell = (it) => (it.from ? "от " : "") + rub(it.price) + (it.unit ? `<small> ${esc(it.unit)}</small>` : "");
// p.pos – точка кадрирования (object-position), например "30% 50%": главное в широком кадре сбоку
const img = (p, cls = "", sizes = "") => p && p.img ? `<img class="${cls}" src="assets/${attr(p.img)}" alt="${attr(p.alt || "")}" loading="lazy" decoding="async"${p.pos ? ` style="object-position:${attr(p.pos)}"` : ""}${sizes}>` : "";
const heroImg = C.hero || (C.photos || [])[0] || null;
const photos = (C.photos || []).filter((p) => !heroImg || p.img !== heroImg.img).slice(0, 3);
const tel = C.contacts?.phone || "{{телефон}}";
const telHref = /\{\{/.test(tel) ? "#" : "tel:" + tel.replace(/[^+\d]/g, "");
const vars = (p) => [...VARS, ...OPT].map((v) => `--c-${v}: ${p[v]};`).join(" ");
// широкие дисплейные шрифты (Unbounded) дают заголовок в 6–7 строк – уменьшаем кегль h1
const h1k = C.h1Scale || (/Unbounded|Druk|Benzin|Russo/i.test(fDisplay) ? 0.8 : 1);
const paletteJson = JSON.stringify(Object.fromEntries(Object.entries(palettes).map(([k, p]) => [k, { name: names[k] || k, vars: p }])));
const demoNote = C.demoPrices ? `<p class="s-demo">Цены для примера. В вашем сайте будут ваши.</p>` : "";

const headBlock = (title) => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${attr(C.lead || "")}">
<meta property="og:type" content="website">
<meta property="og:title" content="${attr(C.h1 || title)}">
<meta property="og:description" content="${attr(C.lead || "")}">
${heroImg ? `<meta property="og:image" content="assets/${attr(heroImg.img)}">\n<link rel="preload" as="image" href="assets/${attr(heroImg.img)}" fetchpriority="high">` : ""}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect x=%276%27 y=%276%27 width=%2720%27 height=%2720%27 rx=%275%27 fill=%27${encodeURIComponent(pal.accent)}%27/%3E%3C/svg%3E">
${fontLinks}
<style>${fontFaces}
:root { ${vars(pal)} --f-display: ${fDisplay}; --f-text: ${fText}; --h1k: ${h1k}; }
</style>
<link rel="stylesheet" href="style-${style}.css">
</head>`;

const bar = (btnText, btnHref) => `<header class="s-bar" data-s-bar>
  <a class="s-bar__brand" href="#top"><i aria-hidden="true"></i>${esc(C.brand)}</a>
  <div class="s-bar__right">
    <a class="s-bar__tel" href="${attr(telHref)}">${esc(tel)}</a>
    <a class="s-btn s-btn--sm" href="${attr(btnHref)}">${esc(btnText)}</a>
  </div>
</header>`;

const priceBoard = () => (C.prices?.groups || []).map((g) => `<div class="s-board__group">
      ${g.title ? `<h3 class="s-board__title">${esc(g.title)}</h3>` : ""}
      <ul class="s-board__list">${g.items.map((it) => `
        <li class="s-board__row"><span class="s-board__name">${esc(it.name)}${it.note ? `<em>${esc(it.note)}</em>` : ""}</span><span class="s-board__dots" aria-hidden="true"></span><span class="s-board__price">${priceCell(it)}</span></li>`).join("")}
      </ul>
    </div>`).join("\n");

const steps = () => `<ol class="s-steps">${(C.steps || []).map((s, i) => `
      <li class="s-steps__item"><span class="s-steps__n">${String(i + 1).padStart(2, "0")}</span><h3>${esc(s.t)}</h3>${s.d ? `<p>${esc(s.d)}</p>` : ""}</li>`).join("")}
    </ol>`;

const promises = () => `<ul class="s-promises">${(C.promises || []).map((p) => `
      <li><h3>${esc(p.t)}</h3>${p.d ? `<p>${esc(p.d)}</p>` : ""}</li>`).join("")}
    </ul>`;

// отзывы: из styles.json (reviews: [{text, name, date}], минимум три) или слоты; reviews: false – блока нет
const rv = Array.isArray(C.reviews) && C.reviews.length >= 3 ? C.reviews.slice(0, 3) : null;
const reviews = () => `<ul class="s-reviews">${[0, 1, 2].map((i) => `
      <li><blockquote>«${rv ? esc(rv[i].text) : `{{отзыв ${i + 1}}}`}»</blockquote><p class="s-reviews__who">${rv ? esc(rv[i].name) + (rv[i].date ? " · " + esc(rv[i].date) : "") : `{{имя ${i + 1}}} · {{дата ${i + 1}}}`}</p></li>`).join("")}
    </ul>
    <p class="s-note">${rv ? "Отзывы с карточки на Яндекс.Картах, без правок." : "Отзывы – дословно с карточки на Яндекс.Картах. Меньше трёх – блок убираем."}</p>`;
// шапка отзывов: рейтинг, число отзывов, звёзды и ссылка на карточку (mapsUrl из брифа) – как в каркасах «Кино»
const ratingNum = C.rating === false ? null : (C.rating || "{{рейтинг}}");
const ratingVal = ratingNum ? parseFloat(String(ratingNum).replace(",", ".")) : NaN;
const reviewsHead = () => {
  const parts = [];
  if (ratingNum) parts.push(`<span class="s-reviews__num">${esc(ratingNum)}</span><span class="s-reviews__stars" style="--r: ${isNaN(ratingVal) ? 5 : ratingVal}" aria-label="рейтинг ${esc(ratingNum)} из 5"></span>`);
  if (C.reviewsCount !== false) parts.push(`<span class="s-reviews__count">${esc(C.reviewsCount || "{{отзывов}}")} отзывов</span>`);
  if (C.mapsUrl) parts.push(`<a class="s-reviews__all" href="${attr(C.mapsUrl)}" target="_blank" rel="noopener">Читать все отзывы на Яндекс.Картах</a>`);
  return parts.length ? `<p class="s-reviews__rating">${parts.join("")}</p>` : "";
};
const reviewsSection = (cls) => C.reviews === false ? "" : `<section class="s-section${cls}">
    <header class="s-section__head s-section__head--reviews"><h2>Отзывы с Яндекс.Карт</h2>${reviewsHead()}</header>
    ${reviews()}
  </section>`;
const ratingLine = C.rating === false ? "" : `<p class="s-rating"><b>${esc(C.rating || "{{рейтинг}}")}</b> на Яндекс.Картах · ${esc(C.reviewsCount || "{{отзывов}}")} отзывов</p>`;

const contacts = (btnText, btnHref) => `<div class="s-contacts">
      <dl>
        <div><dt>Адрес</dt><dd>${esc(C.contacts?.address || "{{адрес}}")}, ${esc(C.city || "{{город}}")}</dd></div>
        <div><dt>Часы</dt><dd>${esc(C.contacts?.hours || "{{часы}}")}</dd></div>
        <div><dt>Телефон</dt><dd><a href="${attr(telHref)}">${esc(tel)}</a></dd></div>
      </dl>
      <div class="s-contacts__actions">
        <a class="s-btn" href="${attr(btnHref)}">${esc(btnText)}</a>
        <a class="s-btn s-btn--ghost" data-s-msg="whatsapp" href="#">WhatsApp</a>
        <a class="s-btn s-btn--ghost" data-s-msg="telegram" href="#">Telegram</a>
      </div>
    </div>`;

const messengerData = `data-wa="${attr(C.messenger?.whatsapp || "{{whatsapp}}")}" data-tg="${attr(C.messenger?.telegram || "{{telegram}}")}" data-max="${attr(C.messenger?.max || "")}"`;
const galleryData = gallery ? ` data-s-palettes='${paletteJson.replace(/'/g, "&#39;")}'` : "";

// ================= ЛАЙТ =================
function lite() {
  const ctaHref = "#contacts";
  return `${headBlock(C.brand + " · " + (C.niche || ""))}
<body class="s-lite" id="top" ${messengerData}${galleryData}>
${bar(C.cta || "Записаться", ctaHref)}
<main>
  <section class="s-hero">
    <div class="s-hero__text">
      <p class="s-eyebrow">${esc(C.eyebrow || C.niche || "")}</p>
      <h1>${esc(C.h1)}</h1>
      <p class="s-lead">${esc(C.lead)}</p>
      <div class="s-actions"><a class="s-btn" href="${ctaHref}">${esc(C.cta || "Записаться")}</a><a class="s-link" href="#prices">${esc(C.pricesLink || "Цены")}</a></div>
    </div>
    <figure class="s-hero__img">${img(heroImg, "", ' fetchpriority="high"').replace(' loading="lazy"', "")}</figure>
  </section>

  <ul class="s-facts">${(C.facts || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>

  <section class="s-section" id="prices">
    <header class="s-section__head"><h2>${esc(C.prices?.title || "Услуги и цены")}</h2>${C.prices?.lead ? `<p>${esc(C.prices.lead)}</p>` : ""}</header>
    <div class="s-board">${priceBoard()}</div>
    ${C.prices?.note ? `<p class="s-note">${esc(C.prices.note)}</p>` : ""}${demoNote}
  </section>

  <section class="s-section">
    <header class="s-section__head"><h2>${esc(C.stepsTitle || "Как проходит")}</h2></header>
    ${steps()}
  </section>

  ${photos.length ? `<section class="s-photos" aria-label="Фото">${photos.map((p) => `<figure>${img(p)}${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ""}</figure>`).join("")}</section>` : ""}

  <section class="s-section">
    <header class="s-section__head"><h2>${esc(C.promisesTitle || "Что обещаем")}</h2></header>
    ${promises()}
  </section>

  ${reviewsSection("")}

  <section class="s-section" id="contacts">
    <header class="s-section__head"><h2>${esc(C.contactsTitle || "Контакты")}</h2></header>
    ${contacts(C.cta || "Записаться", telHref)}
  </section>
</main>
<footer class="s-foot"><p>${esc(C.brand)} · ${esc(C.city || "{{город}}")}</p><p>${esc(C.footer || C.niche || "")}</p></footer>
<script src="style.js" defer></script>
</body>
</html>`;
}

// ================= ПРОДАЮЩИЙ =================
function widget() {
  if (C.mode === "booking") {
    const b = C.booking;
    return `<form class="s-widget" data-s-booking data-days="${b.days || 7}" data-closed="${attr((b.closed || []).join(","))}" data-slots="${attr((b.slots || []).join(","))}" data-message="${attr(b.message || "Здравствуйте! Хочу записаться: {услуга}, {день} в {время}.")}" onsubmit="return false">
      <h2 class="s-widget__title">${esc(b.title || "Онлайн-запись")}</h2>
      <fieldset><legend>Услуга</legend>
        <div class="s-chips s-chips--col">${b.services.map((s, i) => `<label class="s-chip s-chip--row"><input type="radio" name="svc" value="${i}" data-name="${attr(s.name)}" data-price="${s.price ?? ""}" data-from="${s.from ? 1 : ""}" data-min="${s.min ?? ""}"${i === 0 ? " checked" : ""}><span>${esc(s.name)}</span><b>${s.price != null ? (s.from ? "от " : "") + rub(s.price) : ""}${s.min ? `<small> · ${s.min} мин</small>` : ""}</b></label>`).join("")}</div>
      </fieldset>
      <fieldset><legend>День</legend><div class="s-chips" data-s-days></div></fieldset>
      <fieldset><legend>Время</legend><div class="s-chips" data-s-times></div></fieldset>
      ${bubbleAndSend(b.send || "Записаться")}
    </form>`;
  }
  const c = C.calc;
  const field = (f) => {
    if (f.type === "select") return `<fieldset><legend>${esc(f.label)}</legend><div class="s-chips${f.options.length > 3 ? " s-chips--col" : ""}">${f.options.map((o, i) => `<label class="s-chip${f.options.length > 3 ? " s-chip--row" : ""}"><input type="radio" name="${attr(f.id)}" value="${i}" data-label="${attr(o.label)}" data-price="${o.price ?? 0}"${i === (f.value || 0) ? " checked" : ""}><span>${esc(o.label)}</span>${f.options.length > 3 && o.price ? `<b>${rub(o.price)}${f.unit ? `<small>/${esc(f.unit)}</small>` : ""}</b>` : o.price && f.showPrice !== false ? `<small class="s-chip__p">${rub(o.price)}${f.unit ? "/" + esc(f.unit) : ""}</small>` : ""}</label>`).join("")}</div></fieldset>`;
    if (f.type === "check") return `<label class="s-check"><input type="checkbox" name="${attr(f.id)}" data-price="${f.price ?? 0}" data-label="${attr(f.label)}"${f.value ? " checked" : ""}><span>${esc(f.label)}</span><b>+${rub(f.price)}</b></label>`;
    return `<div class="s-range"><label for="f-${attr(f.id)}"><span>${esc(f.label)}</span><b><output data-s-out="${attr(f.id)}">${f.value}</output>${f.unit ? ` ${esc(f.unit)}` : ""}</b></label>
      <input id="f-${attr(f.id)}" type="range" name="${attr(f.id)}" min="${f.min}" max="${f.max}" step="${f.step || 1}" value="${f.value}" data-price="${f.price ?? 0}" data-label="${attr(f.short || f.label)}" data-unit="${attr(f.unit || "")}"${f.say ? ` data-say="${attr(f.say)}"` : ""}></div>`;
  };
  return `<form class="s-widget" data-s-calc data-base="${c.base || 0}" data-min="${c.min || 0}" data-min-note="${attr(c.minNote || "минимальный заказ")}" data-per="${attr(JSON.stringify(c.per || {}))}" data-message="${attr(c.message || "Здравствуйте! Хочу рассчитать: {выбор}. Предварительно {итого}.")}" onsubmit="return false">
      <h2 class="s-widget__title">${esc(c.title || "Рассчитать стоимость")}</h2>
      ${c.fields.map(field).join("\n      ")}
      <p class="s-total"><span>${esc(c.result || "Предварительно")}</span><b data-s-total>–</b></p>
      ${bubbleAndSend(c.send || "Отправить расчёт")}
    </form>`;
}
function bubbleAndSend(sendText) {
  return `<div class="s-bubble" aria-live="polite"><span class="s-bubble__label">Ваше сообщение</span><p data-s-bubble></p></div>
      <div class="s-send">
        <a class="s-btn s-btn--wide" data-s-msg="whatsapp" href="#">${esc(sendText)} в WhatsApp</a>
        <a class="s-btn s-btn--ghost" data-s-msg="telegram" href="#">Telegram</a>
      </div>
      <p class="s-send__note" data-s-copied hidden>Текст скопирован – вставьте его в чат.</p>
      ${demoNote}`;
}

function prod() {
  const ctaText = C.mode === "booking" ? (C.booking?.cta || "Записаться онлайн") : (C.calc?.cta || "Рассчитать стоимость");
  return `${headBlock(C.brand + " · " + (C.niche || ""))}
<body class="s-prod" id="top" ${messengerData}${galleryData}>
${bar(ctaText, "#widget")}
<main>
  <section class="s-hero">
    <div class="s-hero__text">
      <p class="s-eyebrow">${esc(C.eyebrow || C.niche || "")}</p>
      <h1>${esc(C.h1)}</h1>
      <p class="s-lead">${esc(C.lead)}</p>
      <ul class="s-ticks">${(C.facts || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
      ${ratingLine}
      ${heroImg ? `<figure class="s-hero__photo">${img(heroImg)}${heroImg.caption ? `<figcaption>${esc(heroImg.caption)}</figcaption>` : ""}</figure>` : ""}
    </div>
    <div class="s-hero__widget" id="widget">${widget()}</div>
    ${heroImg ? `<figure class="s-hero__bg" aria-hidden="true">${img(heroImg, "", ' fetchpriority="high"').replace(' loading="lazy"', "")}</figure>` : ""}
  </section>

  ${C.includes ? `<section class="s-section s-reveal">
    <header class="s-section__head"><h2>${esc(C.includes.title || "Что входит в цену")}</h2></header>
    <div class="s-incl">
      <div><h3>Входит</h3><ul>${C.includes.in.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div><h3>Отдельно, если нужно</h3><ul>${(C.includes.out || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    </div>
  </section>` : ""}

  <section class="s-section s-reveal" id="prices">
    <header class="s-section__head"><h2>${esc(C.prices?.title || "Цены")}</h2>${C.prices?.lead ? `<p>${esc(C.prices.lead)}</p>` : ""}</header>
    <div class="s-board">${priceBoard()}</div>
    ${C.prices?.note ? `<p class="s-note">${esc(C.prices.note)}</p>` : ""}${demoNote}
  </section>

  <section class="s-section s-reveal">
    <header class="s-section__head"><h2>${esc(C.stepsTitle || "Как проходит")}</h2></header>
    ${steps()}
  </section>

  ${photos.length ? `<section class="s-photos s-reveal" aria-label="Фото">${photos.map((p) => `<figure>${img(p)}${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ""}</figure>`).join("")}</section>` : ""}

  <section class="s-section s-reveal">
    <header class="s-section__head"><h2>${esc(C.promisesTitle || "Гарантии")}</h2></header>
    ${promises()}
  </section>

  ${reviewsSection(" s-reveal")}

  ${(C.faq || []).length ? `<section class="s-section s-reveal">
    <header class="s-section__head"><h2>Частые вопросы</h2></header>
    <div class="s-faq">${C.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div>
  </section>` : ""}

  <section class="s-section s-final s-reveal" id="contacts">
    <header class="s-section__head"><h2>${esc(C.finalTitle || "Посчитаем и ответим в мессенджере")}</h2></header>
    ${contacts(ctaText, "#widget")}
  </section>
</main>
<footer class="s-foot"><p>${esc(C.brand)} · ${esc(C.city || "{{город}}")}</p><p>${esc(C.footer || C.niche || "")}</p></footer>
<nav class="s-dock" aria-label="Быстрая связь"><a class="s-btn" href="#widget">${esc(ctaText)}</a><a class="s-btn s-btn--ghost" href="${attr(telHref)}">Позвонить</a></nav>
<script src="style.js" defer></script>
</body>
</html>`;
}

let html = style === "lite" ? lite() : prod();
// в галерее слоты подсвечены пунктиром, чтобы читались как «здесь будут ваши данные», а не как опечатка
if (gallery) html = html.replace(/>([^<]*)</g, (m, t) => ">" + t.replace(/{{([^}]+)}}/g, '<span class="s-slot">{{$1}}</span>') + "<");
fs.writeFileSync(path.join(out, "index.html"), html);
const slots = [...new Set(html.match(/\{\{[^}]+\}\}/g) || [])];
console.log(`✓ ${slug} · ${style === "lite" ? "Лайт" : "Продающий"} → ${path.join(out, "index.html")}`);
console.log(`  палитры: ${Object.keys(palettes).map((k) => k + " «" + (names[k] || "") + "»").join(", ")} · сейчас ${flag("--palette") || "А"}`);
console.log(`  шрифты: ${fDisplay.split(",")[0]} / ${fText.split(",")[0]} · слотов на странице: ${slots.length}`);
