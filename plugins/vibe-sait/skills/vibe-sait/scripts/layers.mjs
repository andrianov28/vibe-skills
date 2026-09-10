#!/usr/bin/env node
/**
 * Вырезка фона для слоёв параллакса: PNG с прозрачностью.
 *
 *   node layers.mjs in.png out.png
 *   node layers.mjs <папка-входа> <папка-выхода>
 *
 * Нужен пакет @imgly/background-removal-node (npm i в папке сборки, не на диске
 * с синхронизацией: модель весит ~100 МБ). Папку с node_modules можно указать
 * в VIBE_BGREMOVE_DIR.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const [inp, outp] = process.argv.slice(2);
if (!inp || !outp) { console.error("node layers.mjs <вход> <выход>"); process.exit(1); }

let removeBackground, publicPath;
const candidates = [process.cwd(), process.env.VIBE_BGREMOVE_DIR, path.join(process.env.USERPROFILE || "", "Documents", "My Claude code", "bg-remove")].filter(Boolean);
for (const c of candidates) {
  try { const req = createRequire(path.join(c, "package.json")); removeBackground = req("@imgly/background-removal-node").removeBackground; publicPath = "file://" + path.dirname(req.resolve("@imgly/background-removal-node")).split(path.sep).join("/") + "/"; break; } catch {}
}
if (!removeBackground) { console.error("не найден @imgly/background-removal-node, задай VIBE_BGREMOVE_DIR"); process.exit(1); }

const cut = async (src, dst) => {
  const ext = path.extname(src).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const blob = await removeBackground(new Blob([fs.readFileSync(src)], { type: mime }), { publicPath });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, Buffer.from(await blob.arrayBuffer()));
  console.log("+", dst);
};
if (fs.statSync(inp).isDirectory()) {
  for (const f of fs.readdirSync(inp).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))) await cut(path.join(inp, f), path.join(outp, f.replace(/\.[^.]+$/, ".png")));
} else await cut(inp, outp);
