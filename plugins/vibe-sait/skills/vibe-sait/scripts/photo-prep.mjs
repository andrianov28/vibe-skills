#!/usr/bin/env node
/**
 * Фото заказчика (с карточки Карт, из брифа) → лёгкие webp для сайта.
 *
 *   node photo-prep.mjs "<папка сайта>" "<исходник.jpg>=hero" "<исходник2.jpg>=stanok" … [--hero-w 1920] [--w 1200] [--q 78]
 *
 * Каждый аргумент «путь=имя» кладёт файл в <папка сайта>/assets/<имя>.webp. Имя hero (и og) – широкое, 1920 px,
 * остальные – 1200 px по длинной стороне. Печатает вес. Исходники не трогает.
 */
import fs from "node:fs";
import path from "node:path";
import { requireFromBuild } from "./vibe-env.mjs";

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const site = argv.find((a) => !a.startsWith("--") && !a.includes("="));
const pairs = argv.filter((a) => a.includes("=") && !a.startsWith("--"));
if (!site || !pairs.length) { console.error('node photo-prep.mjs "<папка сайта>" "<файл.jpg>=hero" "<файл2.jpg>=имя" …'); process.exit(1); }
const sharp = requireFromBuild("sharp");
if (!sharp) { console.error("не найден sharp: запусти node setup.mjs (папка сборки ~/.vibe/build)"); process.exit(1); }
const heroW = +flag("--hero-w", 1920), w = +flag("--w", 1200), q = +flag("--q", 78);
const dir = path.join(site, "assets"); fs.mkdirSync(dir, { recursive: true });
let total = 0;
for (const p of pairs) {
  const eq = p.lastIndexOf("="); const src = p.slice(0, eq), name = p.slice(eq + 1).replace(/\.webp$/i, "");
  if (!fs.existsSync(src)) { console.log("○ нет файла " + src); continue; }
  const wide = /^(hero|og)$/i.test(name);
  const out = path.join(dir, name + ".webp");
  await sharp(src).rotate().resize({ width: wide ? heroW : w, height: wide ? undefined : w, fit: "inside", withoutEnlargement: true }).webp({ quality: q }).toFile(out);
  const kb = Math.round(fs.statSync(out).size / 1024); total += kb;
  console.log(`✓ ${name}.webp – ${kb} КБ (из ${path.basename(src)})`);
}
console.log(`итого ${total} КБ${total > 1500 ? " – БОЛЬШЕ бюджета 1,5 МБ, уменьши --w или --q" : ""}`);
