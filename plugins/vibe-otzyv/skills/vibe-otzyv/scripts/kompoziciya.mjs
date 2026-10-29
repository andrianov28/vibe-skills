/**
 * Ролик видео-отзыва (вертикаль 1080×1920): HTML-композиция HyperFrames.
 * html(ctx) → строка index.html.
 *
 * Сверху – имя и «Отзыв о курсе «Вайб-сайты»», в середине – картинка формата, снизу – субтитры по фразам
 * (тайминги из «Студии отзыва»), плашка с суммой заработка, в конце – Академия.
 * Форматы: vitrina (прокрутка витрины в телефоне), cifry (цифры ученика), bylo (было – стало),
 *          galereya (работы по очереди), krug (лицо в кружке поверх работ).
 */
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>");
const r3 = (x) => +(+x).toFixed(3);

export const PALETTES = {
  sinii: { name: "Синий", canvas: "#0d1633", canvas2: "#16244f", ink: "#ffffff", soft: "#aab6d8", accent: "#8fb0ff", accentBg: "#567FE8", accentInk: "#ffffff", card: "#1b2a5c", dark: true },
  grafit: { name: "Графит", canvas: "#232127", canvas2: "#2f2c34", ink: "#ffffff", soft: "#b4b0bb", accent: "#7ea0f5", accentBg: "#567FE8", accentInk: "#ffffff", card: "#38343f", dark: true },
  svetlyi: { name: "Светлый", canvas: "#f2f5fc", canvas2: "#e3eaf9", ink: "#1f1d22", soft: "#5d6170", accent: "#3f68d6", accentBg: "#567FE8", accentInk: "#ffffff", card: "#ffffff", dark: false },
};
export const TRANSITIONS = ["slide", "zoom", "rise"];
export const FORMATS = { vitrina: "Экскурсия по витрине", cifry: "Цифры", bylo: "Было – стало", galereya: "Галерея работ", krug: "Кружок" };

export function html(ctx) {
  const { name, segs, dur, speechEnd, format, palette, transition, cases, stats, bylo, stalo, assets } = ctx;
  const c = PALETTES[palette];
  const D = r3(dur), E = r3(speechEnd);
  const clip = (id, s, d, track, extra = "") => `id="${id}" class="clip" data-start="${r3(s)}" data-duration="${r3(d)}" data-track-index="${track}"${extra}`;

  // ---------- середина по формату ----------
  let mid = "", midCss = "", midJs = "";
  if (format === "vitrina") {
    mid = `<div id="phone" class="phone"><video id="vit" src="assets/vitrina.mp4" data-start="0" data-duration="${E}" data-track-index="3" muted playsinline></video></div>`;
    midCss = `#phone { left: 50%; top: 290px; width: 500px; height: 1083px; margin-left: -250px; }`;
    midJs = `tl.fromTo("#phone", { y: 120, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" }, 0.2);`;
  }
  if (format === "cifry") {
    const n = stats.length, slot = (E - 0.4) / n;
    mid = stats.map((s, i) => `<div class="stat" id="st${i}"><div class="num" id="num${i}" data-v="${esc(s.value)}">${esc(s.value)}</div><div class="lab">${esc(s.label)}</div>${s.shot ? `<div class="mini phone"><img src="${esc(s.shot)}" /></div>` : ""}</div>`).join("\n        ");
    midCss = `.stat { position: absolute; left: 70px; right: 70px; top: 330px; height: 1050px; text-align: center; opacity: 0; }
      .num { display: inline-block; font-size: 230px; font-weight: 800; color: var(--accent); letter-spacing: -0.03em; line-height: 1; white-space: nowrap; }
      .lab { margin-top: 26px; font-size: 58px; font-weight: 700; line-height: 1.15; }
      .mini { position: relative; margin: 60px auto 0; width: 300px; height: 560px; }
      .mini img { width: 100%; height: 100%; object-fit: cover; object-position: top; }`;
    midJs = stats.map((s, i) => {
      const a = r3(0.3 + i * slot), b = r3(a + slot);
      const m = String(s.value).match(/^(\D*?)(\d[\d\s]*\d|\d)(.*)$/);
      const cnt = m ? `{ const el = document.getElementById("num${i}"), o = { v: 0 }, to = ${parseInt(m[2].replace(/\s/g, ""), 10) || 0};
          tl.to(o, { v: to, duration: ${r3(Math.min(1.4, slot * 0.5))}, ease: "power2.out", onUpdate: () => { el.textContent = ${JSON.stringify(m[1])} + Math.round(o.v).toLocaleString("ru-RU").replace(/\\u00a0/g, " ") + ${JSON.stringify(m[3])}; } }, ${a}); }` : "";
      return `tl.fromTo("#st${i}", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, ${a});
        ${cnt}
        ${i < n - 1 ? `tl.to("#st${i}", { opacity: 0, y: -60, duration: 0.4, ease: "power2.in" }, ${r3(b - 0.4)});` : ""}`;
    }).join("\n        ");
  }
  if (format === "bylo") {
    const split = r3(Math.max(4, E * 0.36));
    const shots = cases.slice(0, 6);
    mid = `<div id="byl"><div class="pill">Было</div>${bylo.map((t, i) => `<div class="bl" id="bl${i}">${esc(t)}</div>`).join("")}<div id="empty">?</div></div>
        <div id="stl"><div class="pill on">Стало</div><div id="grid">${shots.map((s, i) => `<div class="gi phone" id="g${i}"><img src="${esc(s.mobile)}" /></div>`).join("")}</div>
        <div id="chips">${stalo.map((t, i) => `<span class="chip" id="ch${i}">${esc(t)}</span>`).join("")}</div></div>`;
    const cols = shots.length <= 2 ? shots.length : 3, w = cols === 1 ? 400 : cols === 2 ? 360 : shots.length > 3 ? 238 : 290;
    midCss = `#byl, #stl { position: absolute; left: 70px; right: 70px; top: 300px; height: 1100px; }
      .pill { display: inline-block; font-size: 40px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; padding: 14px 34px; border-radius: 60px; background: var(--card); color: var(--soft); }
      .pill.on { background: var(--accentBg); color: var(--accentInk); }
      .bl { margin-top: 44px; font-size: 64px; font-weight: 700; line-height: 1.18; color: var(--soft); opacity: 0; }
      #grid { margin-top: 40px; display: flex; flex-wrap: wrap; gap: 26px; justify-content: center; }
      .gi { position: relative; width: ${w}px; height: ${Math.round(w * 1.72)}px; opacity: 0; }
      .gi img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
      #chips { position: absolute; left: 0; right: 0; bottom: 0; display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; }
      .chip { font-size: 40px; font-weight: 800; padding: 14px 30px; border-radius: 60px; background: var(--accentBg); color: var(--accentInk); opacity: 0; }
      #empty { position: absolute; left: 50%; top: 470px; width: 380px; height: 640px; margin-left: -190px; border: 6px dashed var(--soft); border-radius: 60px; opacity: 0; display: flex; align-items: center; justify-content: center; font-size: 150px; font-weight: 800; color: var(--soft); }`;
    midJs = `tl.set("#stl", { opacity: 0 }, 0);
        tl.fromTo("#byl .pill", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.4 }, 0.3);
        tl.fromTo("#empty", { opacity: 0, scale: 0.9 }, { opacity: 0.55, scale: 1, duration: 0.6 }, 0.9);
        ${bylo.map((_, i) => `tl.fromTo("#bl${i}", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, ${r3(0.7 + i * Math.min(1.2, (split - 1.2) / Math.max(1, bylo.length)))});`).join("\n        ")}
        tl.to("#byl", { opacity: 0, y: -50, duration: 0.45, ease: "power2.in" }, ${r3(split - 0.45)});
        tl.to("#stl", { opacity: 1, duration: 0.01 }, ${split});
        tl.fromTo("#stl .pill", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2)" }, ${split});
        ${shots.map((_, i) => `tl.fromTo("#g${i}", { opacity: 0, y: 80, scale: 0.85 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "back.out(1.6)" }, ${r3(split + 0.4 + i * 0.32)});`).join("\n        ")}
        ${stalo.map((_, i) => `tl.fromTo("#ch${i}", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, ${r3(split + 0.6 + shots.length * 0.32 + i * 0.3)});`).join("\n        ")}`;
  }
  if (format === "galereya") {
    const list = cases.slice(0, 8), slot = (E - 0.2) / list.length;
    mid = list.map((s, i) => `<div class="gal" id="gl${i}"><div class="phone gp"><img src="${esc(s.mobile)}" /></div><div class="gt">${esc(s.title)}</div><div class="gs">${esc([s.niche, s.city].filter(Boolean).join(" · "))}</div></div>`).join("\n        ");
    midCss = `.gal { position: absolute; left: 0; right: 0; top: 290px; height: 1120px; text-align: center; opacity: 0; }
      .gp { position: relative; margin: 0 auto; width: 480px; height: 880px; }
      .gp img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
      .gt { margin-top: 34px; font-size: 60px; font-weight: 800; }
      .gs { margin-top: 8px; font-size: 38px; color: var(--soft); }`;
    const tin = transition === "slide" ? `{ opacity: 0, x: 700 }` : transition === "zoom" ? `{ opacity: 0, scale: 0.8 }` : `{ opacity: 0, y: 160 }`;
    const tout = transition === "slide" ? `{ opacity: 0, x: -700` : transition === "zoom" ? `{ opacity: 0, scale: 1.12` : `{ opacity: 0, y: -160`;
    midJs = list.map((_, i) => {
      const a = r3(0.2 + i * slot), b = r3(a + slot);
      return `tl.fromTo("#gl${i}", ${tin}, { opacity: 1, x: 0, y: 0, scale: 1, duration: 0.55, ease: "power3.out" }, ${a});
        tl.fromTo("#gl${i} .gp img", { objectPosition: "50% 0%" }, { objectPosition: "50% 35%", duration: ${r3(Math.max(0.5, slot - 0.6))}, ease: "sine.inOut" }, ${r3(a + 0.5)});
        ${i < list.length - 1 ? `tl.to("#gl${i}", ${tout}, duration: 0.45, ease: "power2.in" }, ${r3(b - 0.45)});` : ""}`;
    }).join("\n        ");
  }
  if (format === "krug") {
    const strip = cases.slice(0, 8);
    const row = [...strip, ...strip, ...strip];
    mid = `<div id="ring"><video id="face" src="assets/face.mp4" data-start="0" data-duration="${E}" data-track-index="3" muted playsinline></video></div>
        <div id="strip"><div id="rail">${row.map((s) => `<div class="sc"><img src="${esc(s.desktop || s.mobile)}" /></div>`).join("")}</div></div>`;
    midCss = `#ring { position: absolute; left: 50%; top: 300px; width: 660px; height: 660px; margin-left: -330px; border-radius: 50%; overflow: hidden; border: 12px solid var(--accentBg); box-shadow: 0 40px 120px rgba(0,0,0,0.45); background: #000; }
      #ring video { width: 100%; height: 100%; object-fit: cover; }
      #strip { position: absolute; left: 0; right: 0; top: 1030px; height: 340px; overflow: hidden; }
      #rail { position: absolute; left: 0; top: 0; height: 340px; display: flex; gap: 24px; }
      .sc { flex: none; width: 540px; height: 340px; border-radius: 26px; overflow: hidden; background: var(--card); }
      .sc img { width: 100%; height: 100%; object-fit: cover; object-position: top; }`;
    midJs = `tl.fromTo("#ring", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: "back.out(1.5)" }, 0.15);
        tl.fromTo("#strip", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.6 }, 0.6);
        tl.fromTo("#rail", { x: 0 }, { x: -${strip.length * 564}, duration: ${E}, ease: "none" }, 0);`;
  }

  // ---------- субтитры и плашки ----------
  const subs = segs.map((s, i) => `<div class="sub" id="sb${i}">${rich(s.t)}</div>`).join("\n        ");
  const plates = (format === "cifry" ? [] : segs).map((s, i) => (s.plashka ? `<div class="plate" id="pl${i}"><div class="pv">${esc(s.plashka)}</div>${s.plashkaLabel ? `<div class="pl">${esc(s.plashkaLabel)}</div>` : ""}</div>` : "")).join("");
  const subJs = segs.map((s, i) => {
    const a = r3(s.s), b = r3(i === segs.length - 1 ? E + 0.2 : s.e);
    return `tl.fromTo("#sb${i}", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" }, ${a});
        tl.to("#sb${i}", { opacity: 0, duration: 0.15 }, ${r3(Math.max(a + 0.3, b - 0.15))});
        ${s.plashka && format !== "cifry" ? `tl.fromTo("#pl${i}", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2.2)" }, ${r3(a + 0.15)});
        tl.to("#pl${i}", { opacity: 0, scale: 0.9, duration: 0.3 }, ${r3(Math.max(a + 1.2, b - 0.3))});` : ""}`;
  }).join("\n        ");

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>${esc(name)} – видео-отзыв</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap" rel="stylesheet" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      :root { --canvas: ${c.canvas}; --canvas2: ${c.canvas2}; --ink: ${c.ink}; --soft: ${c.soft}; --accent: ${c.accent}; --accentBg: ${c.accentBg}; --accentInk: ${c.accentInk}; --card: ${c.card}; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: var(--canvas); }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; color: var(--ink); font-family: Manrope, Arial, sans-serif; }
      #bg { position: absolute; inset: 0; background: radial-gradient(1200px 900px at 80% 10%, var(--canvas2), var(--canvas) 70%); }
      #glow { position: absolute; width: 900px; height: 900px; left: -300px; top: 900px; border-radius: 50%; background: var(--accentBg); opacity: ${c.dark ? 0.16 : 0.10}; filter: blur(120px); }
      #head { position: absolute; left: 70px; right: 70px; top: 110px; }
      #nm { display: inline-block; font-size: 60px; font-weight: 800; letter-spacing: -0.01em; white-space: nowrap; }
      #tg { margin-top: 10px; font-size: 34px; font-weight: 600; color: var(--soft); }
      #tg b { color: var(--accent); font-weight: 800; }
      .phone { position: absolute; border-radius: 64px; overflow: hidden; border: 14px solid #0b0b0d; background: #fff; box-shadow: 0 50px 130px rgba(0,0,0,${c.dark ? 0.55 : 0.25}); }
      .phone video { width: 100%; height: 100%; object-fit: cover; }
      ${midCss}
      #subs { position: absolute; left: 60px; right: 60px; top: 1440px; height: 330px; }
      .sub { position: absolute; left: 0; right: 0; top: 0; text-align: center; font-size: 62px; font-weight: 800; line-height: 1.2; opacity: 0;
        padding: 26px 34px; border-radius: 34px; background: ${c.dark ? "rgba(0,0,0,0.42)" : "rgba(255,255,255,0.86)"}; }
      .sub em { font-style: normal; color: var(--accent); }
      .plate { position: absolute; left: 50%; top: 620px; transform-origin: center; margin-left: -430px; width: 860px; text-align: center; padding: 46px 30px; border-radius: 44px;
        background: var(--accentBg); color: var(--accentInk); box-shadow: 0 40px 120px rgba(0,0,0,0.45); opacity: 0; }
      .pv { display: inline-block; font-size: 150px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; white-space: nowrap; }
      .pl { margin-top: 24px; font-size: 46px; font-weight: 700; }
      #outro { position: absolute; inset: 0; background: var(--canvas); opacity: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 40px; }
      #lg { background: #fff; border-radius: 36px; padding: 34px 48px; }
      #lg img { width: 560px; display: block; }
      #ot1 { font-size: 86px; font-weight: 800; }
      #ot2 { font-size: 40px; color: var(--soft); font-weight: 600; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${D}" data-width="1080" data-height="1920">
      <audio id="snd" src="assets/audio.mp3" data-start="0" data-duration="${D}" data-track-index="0"></audio>
      <div ${clip("bg", 0, D, 1)}><div id="glow"></div></div>
      <div ${clip("head", 0, E + 0.3, 2)}><div id="nm">${esc(name)}</div><div id="tg">Отзыв о курсе <b>«Вайб-сайты»</b></div></div>
      <div id="mid">
        ${mid}
      </div>
      <div ${clip("subs", 0, E + 0.3, 5)}>
        ${subs}
      </div>
      <div ${clip("plates", 0, E + 0.3, 6)}>${plates}</div>
      <div ${clip("outro", E, D - E, 7)}><div id="lg"><img src="assets/logo.png" /></div><div id="ot1">Вайб-сайты</div><div id="ot2">Академия Интернет Маркетинга</div></div>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      document.fonts.ready.then(() => {
        const fit = (el, max) => { if (!el) return; let s = parseFloat(getComputedStyle(el).fontSize); while (el.scrollWidth > max && s > 20) { s -= 2; el.style.fontSize = s + "px"; } };
        fit(document.getElementById("nm"), 940);
        document.querySelectorAll(".num, .pv").forEach((e) => fit(e, 900));
        gsap.config({ nullTargetWarn: false });
        const tl = gsap.timeline({ paused: true });
        tl.fromTo("#head", { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0);
        tl.fromTo("#glow", { x: 0, y: 0 }, { x: 500, y: -300, duration: ${D}, ease: "sine.inOut" }, 0);
        ${midJs}
        ${subJs}
        tl.fromTo("#outro", { opacity: 0 }, { opacity: 1, duration: 0.5 }, ${E});
        tl.fromTo("#lg", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(1.8)" }, ${r3(E + 0.2)});
        tl.fromTo("#ot1", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, ${r3(E + 0.5)});
        tl.fromTo("#ot2", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, ${r3(E + 0.7)});
        window.__timelines["main"] = tl;
      });
    </script>
  </body>
</html>
`;
}
