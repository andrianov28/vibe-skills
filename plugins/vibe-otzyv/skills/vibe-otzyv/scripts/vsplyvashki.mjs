/**
 * Всплывашки видео-отзыва: появляются на слове, которое звучит в речи (время – секунды ролика).
 * Зона – полоса над субтитрами (y 1000–1400). Типы:
 *   num   – цифра со счётчиком и подпись          { to, prefix, suffix, label }
 *   money – сумма со счётчиком в стекле            { to, label, kicker }
 *   check – чек-лист, галочки на словах            { title, items: [{ t, at }] } (у пунктов – время atT)
 *   work  – карточка работы со скрином             { img, title, label }
 *   stamp – штамп-печать                            { text, label }
 *   final – финальная рекомендация курса           { kicker, title, sub }
 * popLayer({ pops, cases }) → { css, html, js }. Каждая всплывашка: { type, id, s, e, ... }.
 */
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r3 = (x) => +(+x).toFixed(3);
const CHECK = `<svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const counter = (sel, from, to, at, dur) =>
  `{ const el = document.querySelector(${JSON.stringify(sel)}), o = { v: ${from} };
  tl.to(o, { v: ${to}, duration: ${r3(dur)}, ease: "power2.out", onUpdate: () => { el.textContent = Math.round(o.v).toLocaleString("ru-RU").replace(/\\u00a0/g, " "); } }, ${r3(at)}); }`;

export function popLayer({ pops }) {
  const css = [`
      #pz { position: absolute; left: 60px; right: 60px; top: 990px; height: 420px; }
      .pp { position: absolute; inset: 0; opacity: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
      .glass { border-radius: 44px; background: var(--popBg); border: 4px solid var(--popLine); box-shadow: 0 40px 110px rgba(0,0,0,0.45); }
      .pnum { font-size: 210px; font-weight: 800; line-height: 0.95; letter-spacing: -0.04em; color: var(--accent); white-space: nowrap; text-shadow: 8px 8px 0 var(--accentBg); }
      .plab { font-size: 50px; font-weight: 800; text-align: center; line-height: 1.12; padding: 0 30px; }
      .pkick { font-size: 34px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--soft); }
      .pmoney { font-size: 140px; font-weight: 800; letter-spacing: -0.03em; white-space: nowrap; color: #22c55e; }
      .ptitle { font-size: 44px; font-weight: 800; align-self: flex-start; padding-left: 44px; }
      .ci { width: 860px; height: 92px; border-radius: 26px; background: var(--popItem); display: flex; align-items: center; gap: 22px; padding: 0 26px; opacity: 0.25; }
      .ci b { font-size: 46px; font-weight: 800; }
      .okb { flex: none; width: 60px; height: 60px; border-radius: 50%; border: 4px solid var(--soft); display: flex; align-items: center; justify-content: center; }
      .okb svg { width: 40px; height: 40px; opacity: 0; }
      .wcard { width: 700px; height: 300px; border-radius: 30px; overflow: hidden; border: 8px solid #fff; box-shadow: 0 30px 90px rgba(0,0,0,0.5); background: #fff; }
      .wcard img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
      .wlab { font-size: 42px; font-weight: 800; padding: 10px 30px; border-radius: 40px; background: var(--accentBg); color: var(--accentInk); white-space: nowrap; }
      .stamp { font-size: 150px; font-weight: 800; letter-spacing: -0.03em; color: var(--accent); border: 14px solid var(--accent); border-radius: 46px; padding: 6px 54px; line-height: 1.05; white-space: nowrap; }
      .slab { font-size: 46px; font-weight: 800; text-align: center; }
      .fkick { font-size: 40px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; padding: 12px 34px; border-radius: 50px; background: var(--accentBg); color: var(--accentInk); }
      .ftitle { font-size: 120px; font-weight: 800; letter-spacing: -0.03em; white-space: nowrap; }
      .fsub { font-size: 38px; font-weight: 700; color: var(--soft); }`];
  const html = [];
  const js = [];

  for (const p of pops) {
    const id = p.id, s = r3(p.s), e = r3(p.e), out = r3(Math.max(s + 0.6, e - 0.22));
    if (p.type === "num") {
      html.push(`<div class="pp glass" id="${id}"><div class="pnum">${esc(p.prefix || "")}<span id="${id}-v">0</span>${esc(p.suffix || "")}</div><div class="plab" id="${id}-l">${esc(p.label || "")}</div></div>`);
      js.push(`tl.fromTo("#${id}", { opacity: 0, y: 70, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "back.out(1.8)" }, ${s});
        tl.fromTo("#${id} .pnum", { scale: 1.9, filter: "blur(18px)" }, { scale: 1, filter: "blur(0px)", duration: 0.35, ease: "expo.out" }, ${s});
        ${counter(`#${id}-v`, 0, p.to, s + 0.05, 0.9)}
        tl.fromTo("#${id}-l", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.3, ease: "back.out(2)" }, ${r3(s + 0.45)});
        tl.to("#${id}", { opacity: 0, y: -50, duration: 0.22, ease: "power2.in" }, ${out});`);
    }
    if (p.type === "money") {
      html.push(`<div class="pp glass" id="${id}">${p.kicker ? `<div class="pkick">${esc(p.kicker)}</div>` : ""}<div class="pmoney"><span id="${id}-v">0</span> ₽</div>${p.label ? `<div class="plab" id="${id}-l">${esc(p.label)}</div>` : ""}</div>`);
      js.push(`tl.fromTo("#${id}", { opacity: 0, y: -60 }, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }, ${s});
        ${counter(`#${id}-v`, 0, p.to, s + 0.1, 1.0)}
        tl.fromTo("#${id} .pmoney", { scale: 1 }, { scale: 1.08, duration: 0.12, yoyo: true, repeat: 1 }, ${r3(s + 1.1)});
        ${p.label ? `tl.fromTo("#${id}-l", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.28, ease: "back.out(2.5)" }, ${r3(s + 1.0)});` : ""}
        tl.to("#${id}", { opacity: 0, y: -60, duration: 0.2, ease: "power2.in" }, ${out});`);
    }
    if (p.type === "check") {
      html.push(`<div class="pp glass" id="${id}" style="gap:12px">${p.title ? `<div class="ptitle">${esc(p.title)}</div>` : ""}${p.items.map((it, i) => `<div class="ci" id="${id}-i${i}"><div class="okb" id="${id}-o${i}">${CHECK}</div><b>${esc(it.t)}</b></div>`).join("")}</div>`);
      js.push(`tl.fromTo("#${id}", { opacity: 0, y: 70 }, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }, ${s});
        ${p.items.map((it, i) => `tl.fromTo("#${id}-i${i}", { opacity: 0.25, x: -40 }, { opacity: 1, x: 0, duration: 0.25, ease: "back.out(2)", immediateRender: false }, ${r3(it.atT)});
        tl.to("#${id}-o${i}", { backgroundColor: "#15803d", borderColor: "#ffffff", scale: 1.18, duration: 0.14 }, ${r3(it.atT + 0.04)});
        tl.to("#${id}-o${i}", { scale: 1, duration: 0.14 }, ${r3(it.atT + 0.2)});
        tl.to("#${id}-o${i} svg", { opacity: 1, duration: 0.1 }, ${r3(it.atT + 0.04)});`).join("\n        ")}
        tl.to("#${id}", { opacity: 0, y: -60, duration: 0.22, ease: "power2.in" }, ${out});`);
    }
    if (p.type === "work") {
      html.push(`<div class="pp" id="${id}"><div class="wcard" id="${id}-c">${p.img ? `<img src="${esc(p.img)}" />` : ""}</div>${p.label ? `<div class="wlab" id="${id}-l">${esc(p.label)}</div>` : ""}</div>`);
      js.push(`tl.set("#${id}", { opacity: 1 }, ${s});
        tl.fromTo("#${id}-c", { opacity: 0, x: 620, rotation: 8 }, { opacity: 1, x: 0, rotation: -2, duration: 0.42, ease: "back.out(1.5)" }, ${s});
        tl.fromTo("#${id}-c img", { objectPosition: "50% 0%" }, { objectPosition: "50% 30%", duration: ${r3(Math.max(0.8, e - s - 0.6))}, ease: "sine.inOut" }, ${r3(s + 0.4)});
        ${p.label ? `tl.fromTo("#${id}-l", { opacity: 0, y: 30, scale: 0.6 }, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: "back.out(2.5)" }, ${r3(s + 0.3)});` : ""}
        tl.to("#${id}", { opacity: 0, x: -620, duration: 0.24, ease: "power2.in" }, ${out});`);
    }
    if (p.type === "stamp") {
      html.push(`<div class="pp" id="${id}"><div class="stamp" id="${id}-t">${esc(p.text)}</div>${p.label ? `<div class="slab" id="${id}-l">${esc(p.label)}</div>` : ""}</div>`);
      js.push(`tl.set("#${id}", { opacity: 1 }, ${s});
        tl.fromTo("#${id}-t", { opacity: 0, scale: 2.6, rotation: -14 }, { opacity: 1, scale: 1, rotation: -5, duration: 0.24, ease: "power4.in" }, ${s});
        tl.to("#${id}-t", { x: 10, duration: 0.05, yoyo: true, repeat: 5 }, ${r3(s + 0.24)});
        ${p.label ? `tl.fromTo("#${id}-l", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.28, ease: "back.out(2)" }, ${r3(s + 0.35)});` : ""}
        tl.to("#${id}", { opacity: 0, scale: 0.85, duration: 0.2, ease: "power2.in" }, ${out});`);
    }
    if (p.type === "final") {
      html.push(`<div class="pp glass" id="${id}"><div class="fkick" id="${id}-k">${esc(p.kicker || "Рекомендую")}</div><div class="ftitle" id="${id}-t">${esc(p.title || "Вайб-сайты")}</div><div class="fsub" id="${id}-s">${esc(p.sub || "Академия Интернет Маркетинга")}</div></div>`);
      js.push(`tl.fromTo("#${id}", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.3, ease: "power3.out" }, ${s});
        tl.fromTo("#${id}-k", { opacity: 0, y: -26 }, { opacity: 1, y: 0, duration: 0.3, ease: "back.out(2)" }, ${r3(s + 0.05)});
        tl.fromTo("#${id}-t", { opacity: 0, scale: 1.8, filter: "blur(16px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.4, ease: "expo.out" }, ${r3(s + 0.25)});
        tl.fromTo("#${id}-s", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3 }, ${r3(s + 0.55)});
        tl.to("#${id}", { opacity: 0, duration: 0.2 }, ${out});`);
    }
  }
  return { css: css.join("\n"), html: html.join("\n          "), js: js.join("\n        ") };
}

/** Звуки под всплывашки: [{ f, t, v }] – файл из sfx/, время ролика, громкость. */
export function popSounds(pops, E) {
  const out = [];
  const add = (f, t, v) => { if (t >= 0) out.push({ f, t: r3(t), v }); };
  for (const p of pops) {
    if (p.type === "num" || p.type === "money") {
      add("pop", p.s, 0.45);
      for (let k = 0; k < 6; k++) add("tick", p.s + 0.12 + k * 0.15, 0.35);
      add("ding", p.s + 1.05, 0.3);
    }
    if (p.type === "check") { add("pop", p.s, 0.4); for (const it of p.items) add("ding", it.atT + 0.04, 0.26); }
    if (p.type === "work") add("whoosh", p.s - 0.06, 0.32);
    if (p.type === "stamp") { add("impact", p.s + 0.2, 0.5); }
    if (p.type === "final") { add("riser", p.s - 0.7, 0.22); add("ding", p.s + 0.3, 0.3); }
  }
  add("whoosh", E - 0.08, 0.3);
  add("ding", E + 0.35, 0.28);
  return out;
}
export const SFXLEN = { whoosh: 0.5, impact: 0.8, pop: 0.18, tick: 0.06, ding: 1, riser: 0.9 };
