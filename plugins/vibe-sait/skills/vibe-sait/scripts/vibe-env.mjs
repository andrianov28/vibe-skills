/**
 * Общие настройки скриптов «Вайб-сайта»: где папка сборки, где ключ kie.ai, где Chrome.
 *
 * Папка сборки (node_modules с playwright-core и sharp): VIBE_BUILD_DIR или ~/.vibe/build.
 * Ключ kie.ai: переменная KIE_AI_API_KEY, иначе файл .env (вверх от текущей папки,
 * потом VIBE_ENV_DIR, потом ~/.vibe/.env).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export const home = process.env.USERPROFILE || process.env.HOME || "";
export const vibeDir = path.join(home, ".vibe");
export const buildDir = process.env.VIBE_BUILD_DIR || path.join(vibeDir, "build");
export const envFile = path.join(vibeDir, ".env");

/** Подключает пакет из папки сборки (текущая папка → VIBE_BUILD_DIR → ~/.vibe/build). */
export function requireFromBuild(name) {
  const dirs = [process.cwd(), process.env.VIBE_BUILD_DIR, buildDir].filter(Boolean);
  for (const d of dirs) {
    try { const req = createRequire(path.join(d, "package.json")); return req(name); } catch {}
  }
  return null;
}

export function findEnvFile() {
  const dirs = [];
  let d = process.cwd();
  for (let i = 0; i < 8; i++) { dirs.push(d); const up = path.dirname(d); if (up === d) break; d = up; }
  if (process.env.VIBE_ENV_DIR) dirs.push(process.env.VIBE_ENV_DIR);
  dirs.push(vibeDir);
  for (const dir of dirs) { const p = path.join(dir, ".env"); if (fs.existsSync(p)) return p; }
  return null;
}

/** Ключ kie.ai или null. */
export function loadKey() {
  if (process.env.KIE_AI_API_KEY) return process.env.KIE_AI_API_KEY;
  const p = findEnvFile();
  if (!p) return null;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*KIE_AI_API_KEY\s*=\s*(.+?)\s*$/);
    if (m && m[1]) return m[1].replace(/^["']|["']$/g, "");
  }
  return null;
}

export function findChrome() {
  return process.env.VIBE_CHROME || [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    (process.env.LOCALAPPDATA || "") + "/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((p) => p && fs.existsSync(p)) || null;
}

/** Баланс кредитов kie.ai (число) или бросает ошибку. */
export async function kieCredits(key) {
  const r = await fetch("https://api.kie.ai/api/v1/chat/credit", { headers: { Authorization: `Bearer ${key}` } });
  const j = await r.json();
  if (j.code && j.code !== 200) throw new Error(j.msg || JSON.stringify(j));
  return j.data;
}
