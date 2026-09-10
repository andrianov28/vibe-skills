#!/usr/bin/env node
/**
 * Настройка сборки сайтов один раз на компьютере ученика.
 *
 *   node setup.mjs              проверить и доустановить всё, что нужно
 *   node setup.mjs --key <ключ> записать ключ kie.ai в ~/.vibe/.env и проверить баланс
 *   node setup.mjs --check      только проверить, ничего не ставить
 *
 * Что делает: папка ~/.vibe/build с playwright-core и sharp (скриншоты и картинки),
 * ищет Chrome, проверяет ключ kie.ai и показывает баланс кредитов.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildDir, vibeDir, envFile, findChrome, loadKey, kieCredits, findEnvFile } from "./vibe-env.mjs";

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : null; };
const checkOnly = argv.includes("--check");
const newKey = flag("--key");
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
if (newKey) {
  fs.writeFileSync(envFile, `KIE_AI_API_KEY=${newKey.trim()}\n`);
  ok(`ключ kie.ai записан в ${envFile}`);
}
const key = loadKey();
if (!key) {
  console.log(`○ kie.ai: ключа нет. Сайты соберутся с нейтральными заглушками вместо фото.`);
  console.log(`  Чтобы подключить картинки: получи ключ на kie.ai (раздел API Keys) и запусти`);
  console.log(`  node setup.mjs --key <ключ>   (ключ ляжет в ${envFile})`);
} else {
  try {
    const credits = await kieCredits(key);
    ok(`kie.ai: ключ работает (${findEnvFile() || "переменная окружения"}), кредитов: ${credits}`);
    if (Number(credits) < 200) console.log("  ! кредитов мало: одна картинка ~20–30, на сайт нужно 5–7 картинок");
  } catch (e) {
    bad(`kie.ai: ключ есть, но не работает (${e.message}). Проверь ключ на kie.ai и запиши заново: node setup.mjs --key <ключ>`);
  }
}

console.log(problems.length ? `\nНЕ ГОТОВО: ${problems.length} проблем(ы), см. выше` : "\nГОТОВО: можно собирать сайты");
process.exit(problems.length ? 1 : 0);
