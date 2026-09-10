#!/usr/bin/env node
/**
 * Настройка сборки сайтов один раз на компьютере ученика.
 *
 *   node setup.mjs              проверить и доустановить всё, что нужно
 *   node setup.mjs --check      только проверить, ничего не ставить
 *   node setup.mjs --open-env   открыть файл ключа ~/.vibe/.env в Блокноте (ключ вставляет ученик руками)
 *
 * Ключ kie.ai в чат не вставляется никогда: скрипт готовит файл .env с пустой строкой
 * KIE_AI_API_KEY=, ученик открывает его и вставляет ключ сам.
 *
 * Что делает: папка ~/.vibe/build с playwright-core и sharp (скриншоты и картинки),
 * ищет Chrome, проверяет ключ kie.ai и показывает баланс кредитов.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { buildDir, vibeDir, envFile, findChrome, loadKey, kieCredits, findEnvFile } from "./vibe-env.mjs";

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : null; };
const checkOnly = argv.includes("--check");
const openEnv = argv.includes("--open-env");
const problems = [];
const ok = (s) => console.log("✓ " + s);
const bad = (s) => { console.log("✗ " + s); problems.push(s); };

// 1. Node
const [major] = process.versions.node.split(".").map(Number);
if (major >= 20) ok(`Node.js ${process.versions.node}`);
else bad(`Node.js ${process.versions.node} слишком старый, нужен 20 или новее: https://nodejs.org (LTS)`);

// 2. Папка сборки и пакеты
fs.mkdirSync(buildDir, { recursive: true });
const pkgFile = path.join(buildDir, "package.json");
if (!fs.existsSync(pkgFile)) fs.writeFileSync(pkgFile, JSON.stringify({ name: "vibe-build", private: true, description: "Папка сборки «Вайб-сайта»: пакеты для скриншотов и картинок" }, null, 2));
const need = ["playwright-core", "sharp"].filter((p) => !fs.existsSync(path.join(buildDir, "node_modules", p)));
if (!need.length) ok(`папка сборки ${buildDir}: playwright-core и sharp на месте`);
else if (checkOnly) bad(`в ${buildDir} нет пакетов: ${need.join(", ")} (запусти setup без --check)`);
else {
  console.log(`… ставлю ${need.join(", ")} в ${buildDir} (одна-две минуты)`);
  const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", ...need], { cwd: buildDir, stdio: "inherit", shell: true });
  if (r.status === 0) ok(`пакеты установлены в ${buildDir}`);
  else bad(`npm install не прошёл (код ${r.status}). Проверь, что npm установлен вместе с Node.js, и повтори`);
}

// 3. Chrome для скриншотов
const chrome = findChrome();
if (chrome) ok(`Chrome для скриншотов: ${chrome}`);
else bad("Chrome не найден. Установи Google Chrome или укажи путь в переменной VIBE_CHROME");

// 4. Ключ kie.ai
fs.mkdirSync(vibeDir, { recursive: true });
if (!fs.existsSync(envFile) && !findEnvFile()) {
  fs.writeFileSync(envFile, "# Ключ kie.ai (kie.ai → API Keys). Вставь его после знака = и сохрани файл.\nKIE_AI_API_KEY=\n");
  ok(`подготовлен файл ключа: ${envFile}`);
}
if (openEnv) {
  const target = findEnvFile() || envFile;
  const cmd = process.platform === "win32" ? ["notepad.exe", [target]] : process.platform === "darwin" ? ["open", ["-e", target]] : ["xdg-open", [target]];
  try { spawn(cmd[0], cmd[1], { detached: true, stdio: "ignore" }).unref(); ok(`файл ключа открыт в редакторе: ${target}`); } catch (e) { bad(`не смог открыть ${target}: ${e.message}`); }
}
const key = loadKey();
if (!key) {
  console.log(`○ kie.ai: ключа нет. Сайты соберутся с нейтральными заглушками вместо фото.`);
  console.log(`  Чтобы подключить картинки: открой файл ${findEnvFile() || envFile}, вставь ключ с kie.ai (API Keys)`);
  console.log(`  после знака = , сохрани файл и скажи «проверь ключ kie» (node setup.mjs --check)`);
} else {
  try {
    const credits = await kieCredits(key);
    ok(`kie.ai: ключ работает (${findEnvFile() || "переменная окружения"}), кредитов: ${credits}`);
    if (Number(credits) < 200) console.log("  ! кредитов мало: одна картинка ~20–30, на сайт нужно 5–7 картинок");
  } catch (e) {
    bad(`kie.ai: ключ есть, но не работает (${e.message}). Проверь ключ на kie.ai и поправь строку в ${findEnvFile() || envFile}`);
  }
}

console.log(problems.length ? `\nНЕ ГОТОВО: ${problems.length} проблем(ы), см. выше` : "\nГОТОВО: можно собирать сайты");
process.exit(problems.length ? 1 : 0);
