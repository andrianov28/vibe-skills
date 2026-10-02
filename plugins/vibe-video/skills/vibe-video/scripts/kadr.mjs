/**
 * Каркас ролика «Видео-демо сайта» (вертикаль 1080×1920): HTML-композиция HyperFrames.
 * html(ctx) → строка index.html. Все времена – на сетке долей трека: B(n) = offset + n · period.
 *
 * Сцены (порядок фиксированный, необязательные пропускаются):
 *   hook      точка-мотив → название → рейтинг и число отзывов (если есть)
 *   statement «А сайта нет.» → зачёркнуто → «Теперь есть.», снизу выезжает телефон
 *   phone     дроп: живая прокрутка сайта в телефоне, три стеклянные плашки с фактами
 *   prices    экран цвета акцента: до трёх цен со счётчиком            (необязательная)
 *   photos    2–3 фото с сайта с подписями                             (необязательная)
 *   reviews   инверсный экран: 1–3 отзыва дословно                     (необязательная)
 *   desktop   быстрая нарезка компьютерной версии по долям
 *   final     точка → название → «Ваш сайт готов» → «Ссылка – в сообщении ниже»
 */

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// «51 отзыв», «23 отзыва», «226 отзывов» – подпись под счётчиком согласуется с числом
const reviewsWord = (v) => {
  const n = parseInt(String(v ?? "").replace(/\D/g, ""), 10);
  if (isNaN(n)) return "отзывов";
  const d = n % 10, dd = n % 100;
  return d === 1 && dd !== 11 ? "отзыв" : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? "отзыва" : "отзывов";
};
// *слово* → акцентный цвет
const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>");

// ---------- цвет ----------
const hexToRgb = (h) => { const m = String(h).trim().replace("#", ""); const f = m.length === 3 ? m.split("").map((c) => c + c).join("") : m.slice(0, 6); return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0); };
const rgbToHex = (a) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export const mix = (a, b, t) => { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x.map((v, i) => v + (y[i] - v) * t)); };
export const lum = (h) => { const [r, g, b] = hexToRgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** Подтягивает цвет к чёрному или белому, пока не наберёт нужный контраст с фоном. */
export function ensure(fg, bg, min) {
  if (contrast(fg, bg) >= min) return fg;
  const to = lum(bg) > 0.4 ? "#000000" : "#ffffff";
  for (let t = 0.05; t <= 1; t += 0.05) { const c = mix(fg, to, t); if (contrast(c, bg) >= min) return c; }
  return to;
}
const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r}, ${g}, ${b}, ${a})`; };

export function colors(p) {
  const C = p.canvas, I = p.ink, A = p.accent;
  const dark = lum(C) < 0.3;
  const AI = contrast(p.accentInk, A) >= 4.5 ? p.accentInk : (lum(A) > 0.4 ? "#141414" : "#ffffff");
  const rowBg = AI, rowText = ensure(contrast(I, AI) > contrast(C, AI) ? I : C, AI, 7);
  const revBg = I, revText = ensure(C, revBg, 7);
  return {
    dark, canvas: C, ink: I, soft: ensure(p.soft, C, 4.5), accent: A, accentInk: AI,
    accentOnCanvas: ensure(A, C, 3), glow: rgba(A, dark ? 0.22 : 0.16), dots: rgba(I, dark ? 0.08 : 0.07),
    vignette: dark ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.10)",
    rowBg, rowText, price: contrast(A, AI) >= 3 ? A : rowText,
    revBg, revText, revCard: dark ? mix(I, "#ffffff", 0.6) : mix(I, "#ffffff", 0.07),
    revCite: ensure(mix(revText, revBg, 0.45), dark ? mix(I, "#ffffff", 0.6) : mix(I, "#ffffff", 0.07), 4.5),
    revEm: ensure(A, revBg, 4), revMark: ensure(A, dark ? mix(I, "#ffffff", 0.6) : mix(I, "#ffffff", 0.07), 3.2),
    hudBase: ensure(p.soft, C, 4.5), hudPrices: ensure(mix(AI, A, 0.3), A, 4.5), hudReviews: ensure(mix(C, I, 0.35), I, 4.5),
    phoneShadow: dark ? "0 60px 140px rgba(0,0,0,0.65)" : "0 50px 120px rgba(20,20,20,0.28)",
    bar: mix(C, I, dark ? 0.1 : 0.06), urlBg: C, glass: rgba(p.surface || C, 0.78), glassBorder: rgba(I, 0.16),
  };
}

export function html(ctx) {
  const { v, plan, k, fonts, fam, frame } = ctx;
  const c = colors(ctx.palette);
  const P = plan.period, O = plan.offset;
  const S = Object.fromEntries(plan.scenes.map((s) => [s.id, s]));
  const at = (beat) => +(O + beat * P).toFixed(3);
  const dur = plan.duration;
  const DW = fam.displayWeight;

  const faceCss = fonts.map((f) => `@font-face { font-family: "${f.family}"; font-style: ${f.style}; font-weight: ${f.weight}; src: url(assets/fonts/${f.file.split("/").pop()}) format("${f.file.endsWith(".woff2") ? "woff2" : f.file.endsWith(".woff") ? "woff" : "truetype"}");${f.unicodeRange ? ` unicode-range: ${f.unicodeRange};` : ""} }`).join("\n      ");
  const ffam = (name, generic) => (fonts.some((f) => f.family === name) ? `"${name}", ${generic}` : generic);

  const clip = (id, s, extra = "") => `id="${id}" class="clip" data-start="${at(s.start)}" data-duration="${+(s.len * P).toFixed(3)}"${extra}`;
  const R = v.rating;
  const stars = R ? Math.max(1, Math.min(5, Math.round(parseFloat(String(R.value).replace(",", "."))))) : 0;
  const st = v.statement || {};
  const before = st.before || ["А сайта", "нет."], after = st.after || ["Теперь", "есть."];
  const cards = v.phone.stops;
  const pr = v.prices, ph = v.photos, rv = v.reviews, dk = v.desktop || {}, fin = v.final || {};
  const hudL = (v.hud && v.hud.left) || `${v.brand} · демо-сайт`;
  const hudR = (v.hud && v.hud.right) || plan.hudRight;
  const labels = plan.scenes.map((s, i) => `<span id="L${i}">${String(i + 1).padStart(2, "0")} – ${esc(s.label)}</span>`).join("");
  const qSize = (t) => (t.length <= 28 ? 66 : t.length <= 55 ? 54 : t.length <= 95 ? 44 : 38);
  const photoPos = ph ? (ph.items.length === 3 ? [40, 340, 640] : [120, 560]) : [];

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>${esc(v.brand)} – видео-демо сайта</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      ${faceCss}
      :root { --canvas: ${c.canvas}; --ink: ${c.ink}; --soft: ${c.soft}; --accent: ${c.accent}; --accent-c: ${c.accentOnCanvas}; --accent-ink: ${c.accentInk};
        --display: ${ffam(fam.display, "sans-serif")}; --text: ${ffam(fam.text, "sans-serif")}; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: var(--canvas); }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--canvas); color: var(--ink); font-family: var(--text); }
      .clip { position: absolute; inset: 0; }
      em { font-style: normal; color: var(--accent-c); }
      .disp { font-family: var(--display); font-weight: ${DW}; }
      #bg { background-image: radial-gradient(${c.dots} 1.6px, transparent 1.8px); background-size: 48px 48px; }
      #glow { position: absolute; left: 140px; top: 560px; width: 800px; height: 800px; border-radius: 50%; background: radial-gradient(circle, ${c.glow}, rgba(0,0,0,0) 65%); }
      #vignette { background: radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, ${c.vignette} 100%); }
      #hud { pointer-events: none; font-weight: 700; font-size: 20px; letter-spacing: 0.22em; text-transform: uppercase; color: ${c.hudBase}; }
      .hud-tl { position: absolute; left: 72px; top: 76px; display: flex; align-items: center; gap: 14px; max-width: 560px; white-space: nowrap; overflow: hidden; }
      .hud-tl i { display: block; flex: none; width: 14px; height: 14px; border-radius: 50%; background: var(--accent); }
      .hud-tr { position: absolute; right: 72px; top: 76px; white-space: nowrap; }
      .hud-bl { position: absolute; left: 72px; bottom: 80px; width: 600px; height: 26px; }
      .hud-bl span { position: absolute; left: 0; top: 0; white-space: nowrap; opacity: 0; }
      .hud-br { position: absolute; right: 72px; bottom: 90px; width: 240px; height: 3px; background: currentColor; opacity: 0.5; }
      #ruler { width: 100%; height: 100%; background: var(--accent); transform-origin: left center; }
      .crop { position: absolute; width: 34px; height: 34px; border-color: currentColor; border-style: solid; opacity: 0.6; }
      .c1 { left: 36px; top: 36px; border-width: 3px 0 0 3px; } .c2 { right: 36px; top: 36px; border-width: 3px 3px 0 0; }
      .c3 { left: 36px; bottom: 36px; border-width: 0 0 3px 3px; } .c4 { right: 36px; bottom: 36px; border-width: 0 3px 3px 0; }
      .dot { position: absolute; left: 520px; width: 40px; height: 40px; border-radius: 50%; background: var(--accent); }
      .word { font-family: var(--display); font-weight: ${DW}; font-size: 132px; letter-spacing: -0.02em; line-height: 1.05; white-space: nowrap; }
      #dot1 { top: 900px; }
      #mark { position: absolute; left: 0; right: 0; top: 860px; display: flex; flex-direction: column; align-items: center; }
      #eyebrow1 { margin-top: 36px; font-weight: 700; font-size: 30px; letter-spacing: 0.3em; text-transform: uppercase; color: var(--accent-c); white-space: nowrap; }
      #rating { position: absolute; left: 0; right: 0; top: 560px; display: flex; flex-direction: column; align-items: center; }
      #rateNum { font-family: var(--display); font-weight: ${DW}; font-size: 300px; line-height: 1; letter-spacing: -0.04em; }
      #stars { display: flex; gap: 22px; margin-top: 36px; }
      #stars svg { width: 76px; height: 76px; display: block; }
      #rateCap { margin-top: 34px; font-size: 40px; font-weight: 600; color: var(--soft); }
      #reviewsNum { margin-top: 110px; font-family: var(--display); font-weight: ${DW}; font-size: 104px; color: var(--accent-c); line-height: 1; }
      #reviewsCap { margin-top: 18px; font-size: 40px; font-weight: 600; color: var(--soft); }
      .big { font-family: var(--display); font-weight: ${DW}; font-size: 128px; line-height: 1.08; letter-spacing: -0.02em; text-align: center; white-space: nowrap; }
      #noLine { position: absolute; left: 0; right: 0; top: 760px; display: flex; flex-direction: column; align-items: center; }
      #noWord { position: relative; display: block; }
      #strike { position: absolute; left: -10px; right: -10px; top: 54%; height: 16px; background: var(--accent); transform-origin: left center; }
      #yesLine { position: absolute; left: 0; right: 0; top: 820px; display: flex; flex-direction: column; align-items: center; }
      #yesWord { color: var(--accent-c); }
      #phone { position: absolute; left: 168px; top: 196px; width: 744px; height: 1559px; border-radius: 96px; background: #050608;
        box-shadow: 0 0 0 3px #2a2f3a, ${c.phoneShadow}, 0 0 120px ${c.glow}; }
      #screen { position: absolute; left: 22px; top: 22px; width: 700px; height: 1515px; border-radius: 76px; overflow: hidden; background: var(--canvas); }
      #pvid { position: absolute; left: 0; top: 0; width: 700px; height: 1515px; object-fit: cover; display: block; }
      #notch { position: absolute; left: 302px; top: 40px; width: 140px; height: 40px; border-radius: 20px; background: #050608; }
      .glass { position: absolute; width: 470px; padding: 30px 34px; border-radius: 30px; background: ${c.glass}; color: var(--ink);
        border: 1.5px solid ${c.glassBorder}; backdrop-filter: blur(18px); box-shadow: 0 30px 80px rgba(0,0,0,0.35); }
      .glass b { display: block; font-family: var(--display); font-weight: ${DW}; font-size: 38px; line-height: 1.15; }
      .glass span { display: block; margin-top: 12px; font-size: 27px; line-height: 1.35; font-weight: 600; color: var(--soft); }
      .glass .k { display: block; margin: 0 0 14px; font-size: 20px; letter-spacing: 0.22em; font-weight: 700; color: var(--accent-c); text-transform: uppercase; }
      #g0 { left: 560px; top: 1120px; } #g1 { left: 50px; top: 900px; } #g2 { left: 560px; top: 1230px; }
      #priceBg { background: var(--accent); }
      #prices { position: absolute; left: 80px; right: 80px; top: 470px; color: var(--accent-ink); }
      .sk { font-size: 24px; letter-spacing: 0.24em; font-weight: 700; text-transform: uppercase; }
      .sh { margin-top: 24px; font-family: var(--display); font-weight: ${DW}; font-size: 92px; line-height: 1.05; letter-spacing: -0.02em; }
      .prow { margin-top: 34px; display: flex; justify-content: space-between; align-items: baseline; gap: 24px; padding: 34px 40px; border-radius: 28px; background: ${c.rowBg}; color: ${c.rowText}; }
      #pr0 { margin-top: 70px; }
      .prow .sz { font-size: 44px; font-weight: 700; }
      .prow .pr { font-family: var(--display); font-weight: ${DW}; font-size: 64px; color: ${c.price}; white-space: nowrap; }
      #pnote { margin-top: 52px; font-size: 34px; font-weight: 700; line-height: 1.35; }
      #photosT { position: absolute; left: 60px; right: 60px; top: 250px; text-align: center; }
      #photosT .sk { color: var(--accent-c); }
      #photosT .sh { font-size: 76px; line-height: 1.1; }
      #photosT .sh span { display: block; }
      .ph { position: absolute; top: 640px; width: 400px; height: 712px; border-radius: 30px; overflow: hidden; box-shadow: 0 40px 100px rgba(0,0,0,0.45); border: 2px solid ${c.glassBorder}; }
      .ph img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .ph span { position: absolute; left: 20px; bottom: 20px; right: 20px; padding: 12px 18px; border-radius: 14px; background: rgba(11,13,17,0.78); color: #f4f2ee; font-size: 24px; font-weight: 700; }
      #revBg { background: ${c.revBg}; }
      #revHead { position: absolute; left: 80px; right: 80px; top: 470px; color: ${c.revText}; }
      #revHead .score { margin-top: 18px; font-family: var(--display); font-weight: ${DW}; font-size: 60px; }
      #revHead em { color: ${c.revEm}; }
      .quote { position: absolute; left: 80px; right: 80px; top: 820px; padding: 96px 60px 56px; border-radius: 36px; background: ${c.revCard};
        border-left: 14px solid var(--accent); box-shadow: 0 30px 90px rgba(0,0,0,0.18); color: ${c.revText}; }
      .quote p { font-family: var(--display); font-weight: ${DW}; line-height: 1.18; letter-spacing: -0.01em; }
      .quote cite { display: block; margin-top: 36px; font-style: normal; font-size: 32px; font-weight: 700; color: ${c.revCite}; }
      .qm { position: absolute; left: 52px; top: -70px; font-family: var(--display); font-size: 180px; line-height: 1; color: ${c.revMark}; }
      #deskT { position: absolute; left: 0; right: 0; top: 420px; text-align: center; font-family: var(--display); font-weight: ${DW}; font-size: 72px; line-height: 1.1; }
      #browser { position: absolute; left: 60px; top: 680px; width: 960px; height: 660px; border-radius: 22px; overflow: hidden; background: ${c.bar};
        border: 2px solid ${c.glassBorder}; box-shadow: ${c.phoneShadow}; }
      #bbar { position: absolute; left: 0; top: 0; right: 0; height: 60px; background: ${c.bar}; display: flex; align-items: center; gap: 12px; padding-left: 24px; }
      #bbar i { display: block; width: 16px; height: 16px; border-radius: 50%; background: ${rgba(c.ink, 0.25)}; }
      #bbar .url { margin-left: 24px; height: 34px; width: 600px; border-radius: 10px; background: ${c.urlBg}; color: var(--soft); font-size: 20px; font-weight: 600; display: flex; align-items: center; padding-left: 18px; white-space: nowrap; overflow: hidden; }
      .dshot { position: absolute; left: 0; top: 60px; width: 960px; height: 600px; object-fit: cover; object-position: left top; display: block; opacity: 0; }
      #dot2 { top: 640px; }
      #lock { position: absolute; left: 0; right: 0; top: 740px; display: flex; flex-direction: column; align-items: center; }
      #rule { margin-top: 56px; width: 640px; height: 4px; background: var(--accent); transform-origin: center; }
      #ready { margin-top: 64px; font-family: var(--display); font-weight: ${DW}; font-size: 76px; white-space: nowrap; }
      #link { margin-top: 34px; font-size: 44px; font-weight: 600; color: var(--soft); display: flex; align-items: center; gap: 10px; white-space: nowrap; }
      #cursor { display: block; width: 22px; height: 46px; background: var(--accent); }
      #tag { position: absolute; left: 60px; right: 60px; top: 1500px; text-align: center; font-size: 26px; letter-spacing: 0.22em; font-weight: 700; color: var(--soft); text-transform: uppercase; }
      #fade { background: #000; opacity: 0; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${dur}" data-width="1080" data-height="1920">
      <audio id="music" src="assets/music.mp3" data-start="0" data-duration="${dur}" data-track-index="0"></audio>
      <div id="bg" class="clip" data-start="0" data-duration="${dur}" data-track-index="1"><div id="glow"></div></div>

      <section ${clip("s-hook", S.hook)} data-track-index="2">
        <div id="dot1" class="dot"></div>
        <div id="mark"><div id="word" class="word">${esc(v.brand)}</div><div id="eyebrow1">${esc(v.eyebrow || "")}</div></div>
        ${R ? `<div id="rating">
          <div id="rateNum">0</div>
          <div id="stars"></div>
          <div id="rateCap">${esc(R.caption || "на Яндекс.Картах")}</div>
          ${R.count ? `<div id="reviewsNum">0</div><div id="reviewsCap">${esc(R.countCaption || reviewsWord(R.count) + " от клиентов")}</div>` : ""}
        </div>` : ""}
      </section>

      <section ${clip("s-statement", S.statement)} data-track-index="2">
        <div id="noLine" class="big">${before.slice(0, -1).map((l) => `<div class="noA">${esc(l)}</div>`).join("")}<div id="noWord">${esc(before[before.length - 1])}<div id="strike"></div></div></div>
        <div id="yesLine" class="big">${after.slice(0, -1).map((l) => `<div class="yesA">${esc(l)}</div>`).join("")}<div id="yesWord">${esc(after[after.length - 1])}</div></div>
      </section>

      <div id="phone">
        <div id="screen">
          <video id="pvid" src="assets/phone-scroll.mp4" data-start="${plan.rec.start}" data-duration="${plan.rec.duration}" data-track-index="3" muted playsinline></video>
        </div>
        <div id="notch"></div>
      </div>

      <section ${clip("s-phone", S.phone)} data-track-index="4">
        ${cards.map((g, i) => `<div id="g${i}" class="glass">${g.kicker ? `<span class="k">${esc(g.kicker)}</span>` : ""}<b>${rich(g.title)}</b>${g.text ? `<span>${esc(g.text)}</span>` : ""}</div>`).join("\n        ")}
      </section>

      ${pr ? `<section ${clip("s-prices", S.prices)} data-track-index="2">
        <div id="priceBg" class="clip" data-start="${at(S.prices.start)}" data-duration="${+(S.prices.len * P).toFixed(3)}"></div>
        <div id="prices">
          ${pr.kicker ? `<div class="sk">${esc(pr.kicker)}</div>` : ""}
          <div class="sh">${esc(pr.title)}</div>
          ${pr.rows.map((r, i) => `<div class="prow" id="pr${i}"><span class="sz">${esc(r.label)}</span><span class="pr" data-v="${esc(r.value)}">${esc(r.value)}</span></div>`).join("\n          ")}
          ${pr.note ? `<div id="pnote">${esc(pr.note)}</div>` : ""}
        </div>
      </section>` : ""}

      ${ph ? `<section ${clip("s-photos", S.photos)} data-track-index="2">
        <div id="photosT">${ph.kicker ? `<div class="sk">${esc(ph.kicker)}</div>` : ""}<div class="sh">${(Array.isArray(ph.title) ? ph.title : [ph.title]).map((l) => `<span>${esc(l)}</span>`).join("")}</div></div>
        ${ph.items.map((it, i) => `<div class="ph" id="ph${i}" style="left:${photoPos[i]}px"><img src="assets/photos/${esc(it.asset)}" alt="" />${it.caption ? `<span>${esc(it.caption)}</span>` : ""}</div>`).join("\n        ")}
      </section>` : ""}

      ${rv ? `<section ${clip("s-reviews", S.reviews)} data-track-index="2">
        <div id="revBg" class="clip" data-start="${at(S.reviews.start)}" data-duration="${+(S.reviews.len * P).toFixed(3)}"></div>
        <div id="revHead">${rv.kicker ? `<div class="sk">${esc(rv.kicker)}</div>` : ""}${rv.score ? `<div class="score">${rich(rv.score)}</div>` : ""}</div>
        ${rv.items.map((q, i) => `<div class="quote" id="q${i}"><div class="qm">«</div><p style="font-size:${qSize(q.text)}px">${esc(q.text)}</p><cite>${esc(q.author)}</cite></div>`).join("\n        ")}
      </section>` : ""}

      <section ${clip("s-desktop", S.desktop)} data-track-index="2">
        <div id="deskT">${esc(dk.title || "И на компьютере")}</div>
        <div id="browser">
          <div id="bbar"><i></i><i></i><i></i><div class="url">${esc(dk.url || v.brand)}</div></div>
          ${frame.desktop.map((f, i) => `<img class="dshot" id="d${i}" src="assets/site/${f}" alt="" />`).join("\n          ")}
        </div>
      </section>

      <section ${clip("s-final", S.final)} data-track-index="2">
        <div id="dot2" class="dot"></div>
        <div id="lock">
          <div id="word2" class="word">${esc(v.brand)}</div>
          <div id="rule"></div>
          <div id="ready">${esc(fin.ready || "Ваш сайт готов")}</div>
          <div id="link"><span id="linkTxt"></span><i id="cursor"></i></div>
        </div>
        ${fin.tag ? `<div id="tag">${esc(fin.tag)}</div>` : ""}
      </section>

      <div id="vignette" class="clip" data-start="0" data-duration="${dur}" data-track-index="8"></div>
      <div id="hud" class="clip" data-start="0" data-duration="${dur}" data-track-index="9">
        <div class="crop c1"></div><div class="crop c2"></div><div class="crop c3"></div><div class="crop c4"></div>
        <div class="hud-tl"><i></i>${esc(hudL)}</div>
        <div class="hud-tr">${esc(hudR)}</div>
        <div class="hud-bl">${labels}</div>
        <div class="hud-br"><div id="ruler"></div></div>
      </div>
      <div id="fade" class="clip" data-start="${+(dur - 1).toFixed(3)}" data-duration="1" data-track-index="10"></div>
    </div>

    <script>
      const P = ${P}, O = ${O}, DUR = ${dur};
      const B = (n) => O + n * P;
      const S = ${JSON.stringify(Object.fromEntries(plan.scenes.map((s) => [s.id, s.start])))};
      const PLAN = ${JSON.stringify(plan.scenes.map((s) => ({ id: s.id, start: s.start, len: s.len })))};
      const HOOK = ${JSON.stringify(plan.hook)};
      const LINK = ${JSON.stringify(fin.link || "Ссылка – в сообщении ниже")};
      const RATING = ${JSON.stringify(R ? { value: String(R.value), count: R.count || 0, stars } : null)};
      const NCARDS = ${cards.length}, NROWS = ${pr ? pr.rows.length : 0}, NPH = ${ph ? ph.items.length : 0}, NQ = ${rv ? rv.items.length : 0}, ND = ${frame.desktop.length};
      const HUD = ${JSON.stringify({ base: c.hudBase, prices: c.hudPrices, reviews: c.hudReviews })};

      // подгоняет размер шрифта, чтобы строка влезла в ширину
      const textW = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; };
      const fit = (el, maxW) => { if (!el) return; let fs = parseFloat(getComputedStyle(el).fontSize); while (textW(el) > maxW && fs > 20) { fs -= 2; el.style.fontSize = fs + "px"; } };

      document.fonts.ready.then(() => {
        document.querySelectorAll(".word").forEach((e) => fit(e, 940));
        fit(document.getElementById("eyebrow1"), 940);
        document.querySelectorAll(".big > div, .big > .noA, .big > .yesA").forEach((e) => fit(e, 960));
        fit(document.getElementById("ready"), 940); fit(document.getElementById("link"), 900); fit(document.getElementById("deskT"), 940);
        if (RATING) { document.getElementById("stars").innerHTML = '<svg viewBox="0 0 24 24"><path fill="${c.accent}" d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>'.repeat(RATING.stars); }

        gsap.config({ nullTargetWarn: false });
        const tl = gsap.timeline({ paused: true });
        const count = (el, to, at, dur, fmt) => { const o = { v: 0 }; tl.to(o, { v: to, duration: dur, ease: "power2.out", onUpdate: () => { el.textContent = fmt(o.v); } }, at); };

        // HUD: подписи глав, линейка, свечение, цвет под фон сцены
        tl.fromTo("#ruler", { scaleX: 0 }, { scaleX: 1, duration: DUR, ease: "none" }, 0);
        PLAN.forEach((s, i) => {
          tl.fromTo("#L" + i, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.25 }, B(s.start) + 0.05);
          if (PLAN[i + 1]) tl.to("#L" + i, { opacity: 0, duration: 0.12 }, B(PLAN[i + 1].start) - 0.1);
          const col = s.id === "prices" ? HUD.prices : s.id === "reviews" ? HUD.reviews : HUD.base;
          tl.to("#hud", { color: col, duration: 0.2 }, B(s.start));
        });
        tl.fromTo("#glow", { x: 0, y: 0, scale: 0.8 }, { x: -60, y: -200, scale: 1.3, duration: DUR, ease: "sine.inOut" }, 0);

        // 1. Хук: точка → название → рейтинг
        const h = S.hook, hb = HOOK.brand, sc = hb / 8;
        tl.fromTo("#dot1", { scale: 0 }, { scale: 1, duration: 0.45, ease: "back.out(3)" }, B(h));
        tl.to("#dot1", { scaleX: 1.35, scaleY: 0.7, duration: 0.12, yoyo: true, repeat: 1 }, B(h + 1 * sc));
        tl.to("#dot1", { y: -120, duration: 0.5, ease: "power3.inOut" }, B(h + 2 * sc));
        tl.fromTo("#word", { opacity: 0, x: 60, filter: "blur(12px)" }, { opacity: 1, x: 0, filter: "blur(0px)", duration: 0.55, ease: "power3.out" }, B(h + 2.4 * sc));
        tl.fromTo("#eyebrow1", { opacity: 0, y: 24, scale: 1.15 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: "power3.out" }, B(h + 4 * sc));
        if (RATING) {
          tl.to(["#mark", "#dot1"], { y: "-=700", opacity: 0, duration: 0.45, ease: "power3.in" }, B(h + hb - 0.6));
          const r0 = h + hb;
          tl.fromTo("#rateNum", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, B(r0));
          const rv = parseFloat(RATING.value.replace(",", "."));
          const dec = (RATING.value.split(/[.,]/)[1] || "").length;
          count(document.getElementById("rateNum"), rv, B(r0), P * 2, (x) => x.toFixed(dec).replace(".", ","));
          tl.fromTo("#stars svg", { scale: 0, rotate: -40 }, { scale: 1, rotate: 0, duration: 0.3, ease: "back.out(3)", stagger: P / 2 }, B(r0 + 1));
          tl.fromTo("#rateCap", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, B(r0 + 2));
          if (RATING.count) {
            tl.fromTo(["#reviewsNum", "#reviewsCap"], { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.1 }, B(r0 + 4));
            count(document.getElementById("reviewsNum"), RATING.count, B(r0 + 4), P * 3, (x) => String(Math.round(x)));
          }
          tl.to("#rating", { scale: 1.08, opacity: 0, filter: "blur(16px)", duration: 0.4, ease: "power2.in" }, B(r0 + 7.2));
        } else {
          tl.to(["#mark", "#dot1"], { scale: 1.08, opacity: 0, filter: "blur(16px)", duration: 0.4, ease: "power2.in" }, B(h + hb - 0.8));
        }

        // 2. «А сайта нет.» → зачёркнуто → «Теперь есть.» → телефон
        const s2 = S.statement;
        tl.fromTo(".noA", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, B(s2));
        tl.fromTo("#noWord", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, B(s2 + 1));
        tl.fromTo("#strike", { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: "power4.out" }, B(s2 + 4));
        tl.to("#noWord", { y: 260, rotate: 14, opacity: 0, duration: 0.6, ease: "power3.in" }, B(s2 + 6));
        tl.to(".noA", { opacity: 0, y: -40, duration: 0.3 }, B(s2 + 6.5));
        tl.fromTo(".yesA", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }, B(s2 + 7));
        tl.fromTo("#yesWord", { opacity: 0, scale: 1.6 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2.4)" }, B(s2 + 7.5));
        tl.to("#yesLine", { y: -620, scale: 0.55, duration: 0.8, ease: "power3.inOut" }, B(s2 + 9.5));
        tl.to("#yesLine", { opacity: 0, duration: 0.3 }, B(s2 + 15.4));
        tl.fromTo("#phone", { y: 1900, rotateX: 18, transformPerspective: 1600 }, { y: 140, rotateX: 8, duration: P * 5.2, ease: "power3.out" }, B(s2 + 10));
        tl.to("#phone", { y: 0, rotateX: 0, duration: 0.5, ease: "power2.inOut" }, B(s2 + 15));

        // 3. Дроп: телефон с живой прокруткой и плашки
        const p3 = S.phone;
        tl.fromTo("#phone", { scale: 0.96 }, { scale: 1, duration: 0.35, ease: "back.out(3)", immediateRender: false }, B(p3));
        const sides = [120, -120, 120];
        const cin = [1, 5, 9], cout = [4.5, 8.5, 14.5];
        for (let i = 0; i < NCARDS; i++) {
          tl.fromTo("#g" + i, { opacity: 0, x: sides[i], filter: "blur(10px)" }, { opacity: 1, x: 0, filter: "blur(0px)", duration: 0.45, ease: "power3.out" }, B(p3 + cin[i]));
          tl.to("#g" + i, { opacity: 0, x: sides[i] * 0.66, duration: 0.3 }, B(p3 + cout[i]));
        }
        tl.to("#phone", { scale: 2.2, y: -500, opacity: 0, duration: P * 1.2, ease: "power3.in" }, B(p3 + 14.6));

        // 4. Цены
        if (S.prices !== undefined) {
          const p4 = S.prices;
          tl.to("#vignette", { opacity: 0.35, duration: 0.3 }, B(p4));
          tl.to("#vignette", { opacity: 1, duration: 0.3 }, B(p4 + PLAN.find((s) => s.id === "prices").len));
          tl.fromTo("#priceBg", { clipPath: "circle(0% at 50% 45%)" }, { clipPath: "circle(80% at 50% 45%)", duration: 0.45, ease: "power3.out" }, B(p4));
          tl.fromTo(["#prices .sk", "#prices .sh"], { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.12, ease: "power3.out" }, B(p4 + 0.3));
          for (let i = 0; i < NROWS; i++) {
            const at = B(p4 + 2 + i * 2);
            tl.fromTo("#pr" + i, { opacity: 0, x: i % 2 ? 160 : -160 }, { opacity: 1, x: 0, duration: 0.35, ease: "back.out(1.6)" }, at);
            const el = document.querySelector("#pr" + i + " .pr");
            const m = el.dataset.v.match(/^(\\D*?)(\\d(?:[\\d\\s\\u00a0]*\\d)?)(.*)$/);
            if (m) { const n = Number(m[2].replace(/\\D/g, "")); count(el, n, at, P * 1.5, (x) => m[1] + Math.round(x).toLocaleString("ru-RU").replace(/\\u00a0/g, " ") + m[3]); }
          }
          tl.fromTo("#pnote", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4 }, B(p4 + 2 + NROWS * 2));
          tl.to("#prices", { y: -120, opacity: 0, duration: 0.3, ease: "power2.in" }, B(p4 + PLAN.find((s) => s.id === "prices").len - 0.6));
        }

        // 5. Фото
        if (S.photos !== undefined) {
          const p5 = S.photos;
          tl.fromTo("#photosT", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4 }, B(p5));
          for (let i = 0; i < NPH; i++) {
            const rot = NPH === 3 ? (i - 1) * 5 : (i ? 4 : -4);
            tl.fromTo("#ph" + i, { opacity: 0, y: 160, rotate: rot * 1.6 }, { opacity: 1, y: NPH === 3 && i === 1 ? -40 : 30, rotate: rot, duration: 0.6, ease: "power3.out" }, B(p5 + 0.5 + i * 1.2));
            tl.fromTo("#ph" + i + " img", { scale: 1.18 }, { scale: 1, duration: 3, ease: "none" }, B(p5 + 0.5 + i * 1.2));
          }
        }

        // 6. Отзывы
        if (S.reviews !== undefined) {
          const p6 = S.reviews;
          tl.fromTo("#revBg", { clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0% 0 0 0)", duration: 0.35, ease: "power4.out" }, B(p6));
          // светлый (инверсный) экран: виньетка в углах мешает читать HUD – приглушаем
          tl.to("#vignette", { opacity: 0.2, duration: 0.3 }, B(p6));
          tl.to("#vignette", { opacity: 1, duration: 0.3 }, B(p6 + PLAN.find((s) => s.id === "reviews").len));
          tl.fromTo("#revHead", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.35 }, B(p6 + 0.3));
          for (let i = 0; i < NQ; i++) {
            const at = B(p6 + 0.5 + i * 2.5);
            tl.fromTo("#q" + i, { opacity: 0, y: 200, rotate: 2 }, { opacity: 1, y: 0, rotate: 0, duration: 0.4, ease: "back.out(1.4)" }, at);
            if (i < NQ - 1) tl.to("#q" + i, { opacity: 0, y: -160, duration: 0.25, ease: "power2.in" }, at + P * 2.2);
          }
        }

        // 7. Компьютер: нарезка по долям, потом по полдоли
        const p7 = S.desktop;
        tl.fromTo("#deskT", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.35 }, B(p7));
        tl.fromTo("#browser", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.4, ease: "power3.out" }, B(p7));
        const cutB = [0, 2, 3, 4, 4.5, 5, 5.5, 6, 6.5];
        cutB.forEach((b, i) => {
          const id = "#d" + (i % ND);
          tl.set(".dshot", { opacity: 0 }, B(p7 + b));
          tl.set(id, { opacity: 1 }, B(p7 + b));
          tl.fromTo(id, { scale: 1.06 }, { scale: 1, duration: 0.25, ease: "power2.out", immediateRender: false }, B(p7 + b));
        });
        tl.to("#deskT", { opacity: 0, duration: 0.2 }, B(p7 + 7.2));
        tl.to("#browser", { scale: 0.04, borderRadius: 400, opacity: 0, duration: P * 0.9, ease: "power4.in" }, B(p7 + 7.1));

        // 8. Финал
        const p8 = S.final;
        tl.fromTo("#dot2", { y: -500, scale: 0.6 }, { y: 0, scale: 1, duration: 0.45, ease: "power3.in" }, B(p8));
        tl.to("#dot2", { scaleX: 1.5, scaleY: 0.6, duration: 0.1, yoyo: true, repeat: 1 }, B(p8) + 0.45);
        tl.fromTo("#word2", { opacity: 0, filter: "blur(18px)", scale: 1.1 }, { opacity: 1, filter: "blur(0px)", scale: 1, duration: 0.6, ease: "power3.out" }, B(p8 + 1));
        tl.fromTo("#rule", { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power3.inOut" }, B(p8 + 2));
        tl.fromTo("#ready", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, B(p8 + 3));
        const lt = { n: 0 };
        tl.fromTo("#link", { opacity: 0 }, { opacity: 1, duration: 0.2 }, B(p8 + 5));
        tl.to(lt, { n: LINK.length, duration: 1.1, ease: "none", onUpdate: () => { document.getElementById("linkTxt").textContent = LINK.slice(0, Math.round(lt.n)); } }, B(p8 + 5));
        tl.fromTo("#cursor", { opacity: 1 }, { opacity: 0, duration: 0.01, repeat: 7, yoyo: true, repeatDelay: P / 2 }, B(p8 + 7.5));
        tl.fromTo("#tag", { opacity: 0 }, { opacity: 1, duration: 0.6 }, B(p8 + 8));
        tl.fromTo("#fade", { opacity: 0 }, { opacity: 1, duration: 1.0, ease: "power1.in" }, DUR - 1);

        window.__timelines["main"] = tl;
      });
    </script>
  </body>
</html>
`;
}
