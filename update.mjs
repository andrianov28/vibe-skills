#!/usr/bin/env node
/**
 * Обновление скиллов курса «Вайб-сайты» (каталог vibe-skills).
 *
 *   node ~/.claude/plugins/marketplaces/vibe-skills/update.mjs
 *
 * 1. git pull в папке каталога;
 * 2. для каждого установленного скилла копирует свежие файлы поверх всех папок версий в кэше приложения
 *    (~/.claude/plugins/cache/vibe-skills/<скилл>/<версия>/skills/<скилл>/) – приложение грузит именно их;
 * 3. печатает, какой скилл какой версии стал. Ничего не удаляет, settings.json и ключи не трогает.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)); // работает и с кириллицей в имени пользователя
const home = os.homedir();
const cacheRoot = path.join(home, ".claude", "plugins", "cache", "vibe-skills");

try {
  const out = execFileSync("git", ["-C", here, "pull", "--ff-only"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  console.log("каталог: " + out.trim().split("\n").pop());
} catch (e) {
  console.log("каталог: git pull не удался (" + String(e.message || e).split("\n")[0] + ") – обновляю из того, что уже скачано");
}

const plugins = path.join(here, "plugins");
const rows = [];
for (const name of fs.readdirSync(plugins)) {
  const src = path.join(plugins, name, "skills", name);
  if (!fs.existsSync(src)) continue;
  let version = "?";
  try { version = JSON.parse(fs.readFileSync(path.join(plugins, name, ".claude-plugin", "plugin.json"), "utf8")).version; } catch {}
  const cacheDir = path.join(cacheRoot, name);
  if (!fs.existsSync(cacheDir)) { rows.push([name, version, "не установлен – включается отдельной фразой"]); continue; }
  const versions = fs.readdirSync(cacheDir).filter((v) => fs.statSync(path.join(cacheDir, v)).isDirectory());
  for (const v of versions) {
    const dst = path.join(cacheDir, v, "skills", name);
    fs.mkdirSync(dst, { recursive: true });
    copyDir(src, dst);
  }
  rows.push([name, version, "обновлён (" + versions.join(", ") + ")"]);
}
for (const [n, v, s] of rows) console.log(`${n.padEnd(16)} ${String(v).padEnd(7)} ${s}`);
console.log("Готово. Новые версии подхватятся в новом чате.");

function copyDir(src, dst) {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyDir(s, d); }
    else fs.copyFileSync(s, d);
  }
}
