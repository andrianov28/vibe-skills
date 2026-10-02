#!/usr/bin/env node
/**
 * Музыка для ролика.
 *
 *   node muzyka.mjs "<папка сайта>" --style "<стиль по-английски>"    сгенерировать 2 трека через kie.ai (Suno)
 *   node muzyka.mjs "<папка сайта>" --zapas energy|soft               взять запасной трек скилла (без kie)
 *
 * Трек – инструментал ~55 с без вокала. Результат: <сайт>/video/music/track-a.mp3, track-b.mp3
 * и music.json (темп, первая доля, энергия по секундам и место «дропа» – для раскадровки).
 * Ключ kie.ai – как у «Вайб-сайта» (~/.vibe/.env), в чат не вставляется.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadKey, videoOf } from "./env.mjs";
import { analyze, findDrop } from "./beats.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const site = argv.find((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
if (!site) { console.error("укажи папку сайта"); process.exit(1); }
const out = path.join(videoOf(site), "music");
fs.mkdirSync(out, { recursive: true });
const skillDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function report() {
  const info = {};
  for (const f of fs.readdirSync(out).filter((f) => /^track-[a-z]\.mp3$/.test(f)).sort()) {
    const a = analyze(path.join(out, f));
    info[f] = { ...a, drop: findDrop(a) };
    console.log(`✓ ${f}: ${a.duration} с, ${a.bpm} BPM, дроп на доле ${info[f].drop} (≈${(a.offset + info[f].drop * a.period).toFixed(1)} с)`);
    console.log(`  энергия по секундам: ${a.energySec.join("")}`);
  }
  fs.writeFileSync(path.join(out, "music.json"), JSON.stringify(info, null, 2));
}

const zapas = arg("--zapas", null);
if (zapas) {
  const src = path.join(skillDir, "music", `zapas-${zapas}.mp3`);
  if (!fs.existsSync(src)) { console.error(`нет запасного трека ${zapas} (есть: energy, soft)`); process.exit(1); }
  for (const f of fs.readdirSync(out)) if (/^track-/.test(f)) fs.rmSync(path.join(out, f));
  fs.copyFileSync(src, path.join(out, "track-a.mp3"));
  // второй запасной трек – как track-b: «поменяй музыку» без ключа работает так же, как с ключом (build --track b)
  const other = zapas === "energy" ? "soft" : "energy";
  const srcB = path.join(skillDir, "music", `zapas-${other}.mp3`);
  if (fs.existsSync(srcB)) fs.copyFileSync(srcB, path.join(out, "track-b.mp3"));
  console.log(`✓ запасной трек «${zapas}» скопирован (второй вариант – «${other}», для «поменяй музыку»)`);
  report();
  process.exit(0);
}

const KEY = loadKey();
if (!KEY) { console.error("○ ключа kie.ai нет – возьми запасной трек: --zapas energy (бодрый) или --zapas soft (мягкий)"); process.exit(2); }
const H = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const style = arg("--style", "energetic modern electronic house, punchy drums, 120 bpm, driving bass, bright synth stabs, confident, commercial");
const body = {
  model: "ai-music-api/generate",
  input: {
    custom_mode: true, instrumental: true, model: "V6", title: arg("--title", "Site Reel"),
    style: `${style}, instrumental, strong start without long intro, clear build-up and drop around 16 seconds`,
    negative_tags: "vocals, singing, choir, speech, lo-fi, long ambient intro", duration: Number(arg("--duration", "55")),
  },
};
const r = await fetch("https://api.kie.ai/api/v1/jobs/createTask", { method: "POST", headers: H, body: JSON.stringify(body) });
const j = await r.json().catch(() => ({}));
if (j.code !== 200) {
  console.error(`✗ kie.ai не принял задачу: ${j.msg || r.status}${j.code === 402 ? " (не хватает кредитов)" : ""}. Можно взять запасной трек: --zapas energy|soft`);
  process.exit(1);
}
const taskId = j.data.taskId;
console.log(`… музыка генерируется (обычно 1–2 минуты), задача ${taskId}`);
for (let t = 0; t < 120; t++) {
  await new Promise((res) => setTimeout(res, 5000));
  const s = await (await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, { headers: H })).json().catch(() => ({}));
  const st = s.data?.state;
  if (st === "fail") { console.error(`✗ генерация не удалась: ${s.data?.failMsg || "без причины"}. Повтори или возьми запасной трек`); process.exit(1); }
  if (st !== "success") continue;
  const res = JSON.parse(s.data.resultJson || "{}");
  const urls = (res.resultUrls || (res.data || []).map((x) => x.audio_url || x.audioUrl)).filter(Boolean);
  for (const f of fs.readdirSync(out)) if (/^track-/.test(f)) fs.rmSync(path.join(out, f));
  let n = 0;
  for (const u of urls) fs.writeFileSync(path.join(out, `track-${String.fromCharCode(97 + n++)}.mp3`), Buffer.from(await (await fetch(u)).arrayBuffer()));
  if (!n) { console.error("✗ kie.ai вернул задачу без ссылок на аудио"); process.exit(1); }
  report();
  process.exit(0);
}
console.error("✗ музыка не пришла за 10 минут – возьми запасной трек: --zapas energy|soft");
process.exit(1);
