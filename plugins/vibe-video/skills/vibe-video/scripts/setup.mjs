#!/usr/bin/env node
/**
 * Настройка видео один раз на компьютере ученика («настрой видео»).
 *
 *   node setup.mjs           проверить и доустановить всё, что нужно
 *   node setup.mjs --check   только проверить, ничего не ставить
 *
 * Ставит в ~/.vibe/video: HyperFrames (собирает ролик из HTML), FFmpeg и FFprobe (npm-пакеты,
 * в систему ничего не ставится), playwright-core (съёмка сайта). Потом скачивает браузер
 * HyperFrames для быстрого рендера (~270 МБ, один раз). Проверяет Chrome и ключ kie.ai (музыка).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { HF_VERSION, videoDir, envFile, isWin, findChrome, findEnvFile, loadKey, kieCredits, hyperframes, hyperframesBin, ffmpegDirs } from "./env.mjs";

const checkOnly = process.argv.includes("--check");
const problems = [];
const ok = (s) => console.log("✓ " + s);
const bad = (s) => { console.log("✗ " + s); problems.push(s); };

// 1. Node 22+ (требование HyperFrames)
const [major] = process.versions.node.split(".").map(Number);
if (major >= 22) ok(`Node.js ${process.versions.node}`);
else bad(`Node.js ${process.versions.node} слишком старый, для видео нужен 22 или новее: поставь LTS с https://nodejs.org, перезапусти приложение и скажи «настрой видео» ещё раз`);

// 2. Пакеты движка
fs.mkdirSync(videoDir, { recursive: true });
const pkgFile = path.join(videoDir, "package.json");
if (!fs.existsSync(pkgFile)) fs.writeFileSync(pkgFile, JSON.stringify({ name: "vibe-video", private: true, description: "Движок скилла «Видео-демо сайта»: HyperFrames, FFmpeg, съёмка сайта" }, null, 2));
const want = { hyperframes: HF_VERSION, "ffmpeg-static": null, "ffprobe-static": null, "playwright-core": null };
const installed = (p) => { try { return JSON.parse(fs.readFileSync(path.join(videoDir, "node_modules", p, "package.json"), "utf8")).version; } catch { return null; } };
const need = Object.entries(want).filter(([p, v]) => !installed(p) || (v && installed(p) !== v)).map(([p, v]) => (v ? `${p}@${v}` : p));
if (!need.length) ok(`движок ролика в ${videoDir}: HyperFrames ${HF_VERSION}, FFmpeg, съёмка сайта`);
else if (checkOnly || major < 22) bad(`в ${videoDir} не хватает: ${need.join(", ")} (скажи «настрой видео»)`);
else {
  console.log(`… ставлю ${need.join(", ")} в ${videoDir} (около минуты, ~560 МБ)`);
  const r = spawnSync(`npm install --no-audit --no-fund ${need.join(" ")}`, { cwd: videoDir, stdio: "inherit", shell: true });
  if (r.status === 0) ok("движок ролика установлен");
  else bad(`npm install не прошёл (код ${r.status}). Повтори «настрой видео»; если снова ошибка – покажи её текст`);
}
if (ffmpegDirs().length === 2) ok("FFmpeg и FFprobe на месте (свои, из пакета)");
else if (!problems.length) bad("FFmpeg из пакета не найден – повтори «настрой видео»");

// 3. Браузер HyperFrames для рендера
if (hyperframesBin() && !problems.length) {
  if (checkOnly) {
    const r = hyperframes(["browser", "path"], videoDir, { echo: false });
    if (r.status === 0) ok("браузер для рендера на месте"); else bad("браузер для рендера не скачан (скажи «настрой видео»)");
  } else {
    console.log("… проверяю браузер для рендера (первый раз скачается ~270 МБ)");
    const r = hyperframes(["browser", "ensure"], videoDir, { echo: false });
    if (r.status === 0) ok("браузер для рендера готов");
    else bad("не скачался браузер для рендера:\n" + r.out.split("\n").slice(-6).join("\n"));
  }
}

// 4. Chrome для съёмки сайта
const chrome = findChrome();
if (chrome) ok(`Chrome для съёмки сайта: ${chrome}`);
else bad("Chrome не найден: установи Google Chrome (или укажи путь в переменной VIBE_CHROME)");

// 5. kie.ai для музыки (необязательно)
const key = loadKey();
if (!key) {
  console.log(`○ kie.ai: ключа нет – музыка будет из запасных треков скилла. Ключ подключается фразой «настрой сборку сайтов» (скилл «Вайб-сайт»), файл ${findEnvFile() || envFile}`);
} else {
  const c = await kieCredits(key);
  if (typeof c === "number") { ok(`kie.ai: ключ работает, кредитов: ${c}`); if (c < 30) console.log("  ! мало кредитов: одна генерация музыки (два трека) – 12 кредитов (замер 02.10.2026)"); }
  else console.log(`○ kie.ai: ${c} – музыка будет из запасных треков`);
}

console.log(problems.length ? `\nНЕ ГОТОВО: ${problems.length} проблем(ы), см. выше` : "\nГОТОВО: можно делать видео по сайту");
process.exit(problems.length ? 1 : 0);
