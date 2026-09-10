#!/usr/bin/env node
/**
 * Картинки сайта по манифесту images.json (лежит в папке сайта).
 *
 *   node images.mjs <папка сайта>                 сгенерировать через kie.ai всё, чего нет в raw/, и собрать assets/
 *   node images.mjs <папка сайта> --placeholder   вместо генерации нейтральные заглушки (без ключа и кредитов)
 *   node images.mjs <папка сайта> --only hero,og  только указанные id
 *   node images.mjs <папка сайта> --force         перегенерировать даже если raw уже есть
 *   node images.mjs <папка сайта> --outputs-only  не генерировать, только пересобрать assets/ из raw/
 *   node images.mjs <папка сайта> --variant Б     плюс сцены варианта первого экрана Б (записи с "variant": "Б")
 *
 * Манифест: { world, preamble, images: [{ id, raw, ar, ref, scene, preamble?, outputs: [{ file, width, height?, fit?, position?, format?, quality? }] }], keep: [] }
 * Промпт = преамбул + пустая строка + сцена (если у записи "preamble": false – только сцена).
 * Без ключа kie.ai скрипт сам переходит в режим заглушек и говорит об этом.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { requireFromBuild, loadKey, vibeDir } from "./vibe-env.mjs";

const argv = process.argv.slice(2);
const site = argv[0] && !argv[0].startsWith("--") ? path.resolve(argv[0]) : null;
if (!site) { console.error("укажи папку сайта: node images.mjs <папка> [--placeholder] [--only a,b] [--force] [--outputs-only]"); process.exit(1); }
const flag = (n) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : null; };
const force = argv.includes("--force"), outputsOnly = argv.includes("--outputs-only");
const only = (flag("--only") || "").split(",").map((s) => s.trim()).filter(Boolean);
const variant = flag("--variant"); // сцены вариантов первого экрана (поле "variant" в манифесте) делаем только для выбранного варианта

const manifestFile = path.join(site, "images.json");
if (!fs.existsSync(manifestFile)) { console.error("нет images.json в " + site); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const sharp = requireFromBuild("sharp");
if (!sharp) { console.error("не найден sharp: запусти node setup.mjs (папка сборки ~/.vibe/build)"); process.exit(1); }

const key = loadKey();
let placeholder = argv.includes("--placeholder");
if (!placeholder && !key && !outputsOnly) { placeholder = true; console.log("○ ключа kie.ai нет – делаю заглушки. Подключить ключ: node setup.mjs --key <ключ>"); }

// палитра для заглушек – из переменных темы index.html
const html = fs.existsSync(path.join(site, "index.html")) ? fs.readFileSync(path.join(site, "index.html"), "utf8") : "";
const cssVar = (n, d) => (html.match(new RegExp(`--v-${n}\\s*:\\s*(#[0-9a-fA-F]{3,8})`)) || [])[1] || d;
const tone = { canvas: cssVar("canvas", "#e9e6e1"), ink: cssVar("ink", "#2b292e"), accent: cssVar("accent", "#8a8f99") };
const dims = { "16:9": [1920, 1080], "9:16": [1080, 1920], "3:4": [1200, 1600], "1:1": [1200, 1200], "4:3": [1600, 1200] };

const kieScript = path.join(path.dirname(fileURLToPath(import.meta.url)), "kie.mjs");
const results = [];
const kb = (f) => (fs.existsSync(f) ? Math.round(fs.statSync(f).size / 1024) : 0);

async function makePlaceholder(file, ar, id) {
  const [w, h] = dims[ar] || dims["16:9"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tone.canvas}"/><stop offset="1" stop-color="${tone.ink}" stop-opacity=".35"/></linearGradient>
    <radialGradient id="r" cx=".72" cy=".68" r=".6"><stop offset="0" stop-color="${tone.accent}" stop-opacity=".45"/><stop offset="1" stop-color="${tone.accent}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#r)"/>
  <circle cx="${Math.round(w * 0.7)}" cy="${Math.round(h * 0.66)}" r="${Math.round(Math.min(w, h) * 0.22)}" fill="${tone.ink}" fill-opacity=".10"/>
</svg>`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(file);
}

for (const img of manifest.images || []) {
  if (only.length && !only.includes(img.id)) continue;
  if (!only.length && img.generate === false) continue; // файл едет с каркасом (keep), промпт оставлен для справки
  if (!only.length && img.variant && img.variant !== variant) continue; // сцена другого варианта первого экрана
  const raw = path.join(site, img.raw);
  const row = { id: img.id, mode: "есть", raw: img.raw, outputs: [], error: null };
  if (!outputsOnly && (force || !fs.existsSync(raw))) {
    if (placeholder) {
      await makePlaceholder(raw, img.ar, img.id); row.mode = "заглушка";
    } else {
      const prompt = img.preamble === false ? img.scene : `${manifest.preamble}\n\n${img.scene}`;
      const args = [kieScript, "still", prompt, raw, "--ar", img.ar || "16:9"];
      if (img.ref) args.push("--ref", path.join(site, img.ref));
      if (force) args.push("--force");
      console.log(`… kie.ai: ${img.id} (${img.ar}${img.ref ? ", по референсу " + img.ref : ""})`);
      const r = spawnSync(process.execPath, args, { cwd: site, stdio: "inherit", env: { ...process.env, VIBE_ENV_DIR: process.env.VIBE_ENV_DIR || vibeDir } });
      if (r.status !== 0 || !fs.existsSync(raw)) { row.mode = "ОШИБКА"; row.error = `генерация ${img.id} не удалась`; results.push(row); continue; }
      row.mode = "сгенерирована";
    }
  } else if (!fs.existsSync(raw)) { row.mode = "нет raw"; results.push(row); continue; }

  for (const o of img.outputs || []) {
    const out = path.join(site, o.file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const fmt = o.format || (out.toLowerCase().endsWith(".jpg") || out.toLowerCase().endsWith(".jpeg") ? "jpeg" : "webp");
    try {
      let s = sharp(raw).resize({ width: o.width, height: o.height, fit: o.fit || "cover", position: o.position || "centre", withoutEnlargement: true });
      s = fmt === "jpeg" ? s.jpeg({ quality: o.quality || 80 }) : fmt === "png" ? s.png() : s.webp({ quality: o.quality || 78 });
      await s.toFile(out);
      row.outputs.push(`${o.file} ${kb(out)} КБ`);
    } catch (e) { row.error = `${o.file}: ${e.message}`; }
  }
  results.push(row);
}

for (const k of manifest.keep || []) if (!fs.existsSync(path.join(site, k))) console.log(`! в каркасе не хватает файла ${k}`);

let total = 0;
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (!/\.(woff2?|css)$/i.test(f)) total += st.size; } };
if (fs.existsSync(path.join(site, "assets"))) walk(path.join(site, "assets"));

console.log("\nКартинки:");
for (const r of results) console.log(`  ${r.mode.padEnd(14)} ${r.id.padEnd(18)} ${r.outputs.join(", ")}${r.error ? "  ← " + r.error : ""}`);
console.log(`Итого картинок в assets/: ${Math.round(total / 1024)} КБ (бюджет 1500)`);
const errors = results.filter((r) => r.error || r.mode === "нет raw");
if (placeholder) console.log("Режим заглушек: перед отправкой клиенту сгенерируй настоящие картинки (node images.mjs <папка> --force после подключения ключа).");
if (errors.length) { console.log(`Не удалось: ${errors.map((r) => r.id).join(", ")}`); process.exit(1); }
