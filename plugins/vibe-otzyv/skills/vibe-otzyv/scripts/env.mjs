/**
 * Общие настройки скриптов «Видео-демо сайта»: папка движка, FFmpeg, Chrome, ключ kie.ai.
 *
 * Движок ролика живёт в ~/.vibe/video (VIBE_VIDEO_DIR): HyperFrames (HTML → MP4), FFmpeg и FFprobe
 * из npm-пакетов (ставить отдельно ничего не нужно), playwright-core для съёмки сайта.
 * Ключ kie.ai – тот же, что у «Вайб-сайта»: переменная KIE_AI_API_KEY или файл .env
 * (вверх от текущей папки, потом ~/.vibe/.env). Ключ в чат не вставляется никогда.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

export const HF_VERSION = "0.8.106";
export const home = process.env.USERPROFILE || process.env.HOME || "";
export const vibeDir = path.join(home, ".vibe");
export const videoDir = process.env.VIBE_VIDEO_DIR || path.join(vibeDir, "video");
export const envFile = path.join(vibeDir, ".env");
export const isWin = process.platform === "win32";

/** Подключает пакет из папки движка (или из текущей папки). */
export function requireFromVideo(name) {
  for (const d of [videoDir, process.cwd()]) {
    try { return createRequire(path.join(d, "package.json"))(name); } catch {}
  }
  return null;
}

/** Папки с ffmpeg и ffprobe из npm-пакетов – их ставим первыми в PATH для HyperFrames. */
export function ffmpegDirs() {
  const ff = requireFromVideo("ffmpeg-static");
  const fp = requireFromVideo("ffprobe-static");
  const dirs = [];
  if (ff && fs.existsSync(ff)) dirs.push(path.dirname(ff));
  if (fp && fp.path && fs.existsSync(fp.path)) dirs.push(path.dirname(fp.path));
  return dirs;
}
export function ffmpegBin() {
  const ff = requireFromVideo("ffmpeg-static");
  return ff && fs.existsSync(ff) ? ff : "ffmpeg";
}

/** Окружение для запуска HyperFrames: свой FFmpeg первым в PATH. */
export function toolEnv() {
  const sep = isWin ? ";" : ":";
  const key = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") || "PATH";
  return { ...process.env, [key]: [...ffmpegDirs(), process.env[key] || ""].join(sep) };
}

export function hyperframesBin() {
  const p = path.join(videoDir, "node_modules", ".bin", isWin ? "hyperframes.cmd" : "hyperframes");
  return fs.existsSync(p) ? p : null;
}

/** Запуск HyperFrames в папке проекта ролика. Возвращает {status, out}. */
export function hyperframes(args, cwd, { echo = true } = {}) {
  const bin = hyperframesBin();
  if (!bin) return { status: 1, out: "движок ролика не установлен: скажи «настрой видео»" };
  const q = (a) => (/[\s"&|<>^(),]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  const r = isWin
    ? spawnSync([q(bin), ...args.map(q)].join(" "), { cwd, env: toolEnv(), encoding: "utf8", shell: true, maxBuffer: 1 << 26 })
    : spawnSync(bin, args, { cwd, env: toolEnv(), encoding: "utf8", maxBuffer: 1 << 26 });
  const out = (r.stdout || "") + (r.stderr || "");
  const clean = out.split(/\r?\n/).filter((l) => !/initSession|Render:trace|\[INFO\]|DeprecationWarning|trace-deprecation|\x1b\[\?25/.test(l)).join("\n");
  if (echo) console.log(clean.trim());
  return { status: r.status, out: clean };
}

export function findChrome() {
  return process.env.VIBE_CHROME || [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    (process.env.LOCALAPPDATA || "") + "/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium",
  ].find((p) => p && fs.existsSync(p)) || null;
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
  if (process.env.KIE_AI_API_KEY) return process.env.KIE_AI_API_KEY.trim();
  const p = findEnvFile();
  if (!p) return null;
  const m = fs.readFileSync(p, "utf8").match(/^\s*KIE_AI_API_KEY\s*=\s*(.*)$/m);
  const v = m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  return v || null;
}

/** Баланс кредитов kie.ai: число, или строка с причиной. */
export async function kieCredits(key) {
  try {
    const r = await fetch("https://api.kie.ai/api/v1/chat/credit", { headers: { Authorization: `Bearer ${key}` } });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 || j.code === 401) return "ключ не подходит (401) – проверь, что скопирован целиком";
    if (j.code === 200 && typeof j.data === "number") return j.data;
    return `ответ kie.ai: ${j.msg || r.status}`;
  } catch (e) { return `kie.ai не отвечает: ${e.message}`; }
}

/** Папка ролика внутри папки сайта. */
export const videoOf = (site) => path.join(path.resolve(site), "video");

export function readJson(p, d = null) { try { return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "")); } catch { return d; } }
