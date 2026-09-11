#!/usr/bin/env node
/**
 * Публикация сайта на GitHub Pages: бесплатная живая ссылка, правки и откат за полминуты.
 *
 *   node publish.mjs --setup                      поставить gh (GitHub CLI) через winget и войти в GitHub через браузер
 *   node publish.mjs --check                      проверить: gh есть, вход есть, кто вошёл
 *   node publish.mjs "<папка сайта>" [--name имя] [--message "что изменилось"]
 *                                                 опубликовать или обновить сайт (та же ссылка)
 *   node publish.mjs "<папка сайта>" --rollback   откатить последнюю публикацию (и вернуть файлы в папке сайта)
 *   node publish.mjs "<папка сайта>" --history    список публикаций
 *   node publish.mjs "<папка сайта>" --search on|off
 *                                                 открыть/закрыть сайт для поисковиков (по умолчанию закрыт: демо)
 *
 * Как устроено: в папке сайта появляется служебная папка `.publish/` – это git-репозиторий
 * с копией только того, что нужно странице (index.html, vibe.css, vibe.js, assets/).
 * Исходники генераций (raw/), кадры проверки (lab/), бриф и шаблон на GitHub не попадают.
 * Репозиторий публичный (GitHub Pages бесплатно работает только так), поэтому секретов
 * в папке сайта быть не должно – скрипт их и не копирует.
 *
 * Никаких токенов и паролей через чат: вход в GitHub делает gh в браузере ученика.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
const ok = (s) => console.log("✓ " + s);
const info = (s) => console.log("… " + s);
const fail = (s, code = 1) => { console.log("✗ " + s); process.exit(code); };
const win = process.platform === "win32";
const mac = process.platform === "darwin";
const home = process.env.USERPROFILE || process.env.HOME || "";
const vibeBin = path.join(home, ".vibe", "bin");
const ghLocal = path.join(vibeBin, win ? "gh.exe" : "gh");

// ---------- gh ----------
function ghPath() {
  const candidates = win
    ? ["gh", "C:\\Program Files\\GitHub CLI\\gh.exe", path.join(process.env.LOCALAPPDATA || "", "Programs", "GitHub CLI", "gh.exe"), ghLocal]
    : ["gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh", ghLocal];
  for (const c of candidates) {
    const r = spawnSync(c, ["--version"], { encoding: "utf8"});
    if (r.status === 0) return c;
  }
  return null;
}
function gh(args, opts = {}) {
  const bin = ghPath();
  if (!bin) fail("gh (GitHub CLI) не установлен. Скажи «настрой публикацию» (node publish.mjs --setup)");
  const r = spawnSync(bin, args, { encoding: "utf8", ...opts });
  return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
function ghUser() {
  const r = gh(["api", "user", "--jq", "[.login, .id] | @tsv"]);
  if (r.code !== 0) return null;
  const [login, id] = r.out.split("\t");
  return { login, id, email: `${id}+${login}@users.noreply.github.com` };
}

/** Скачивает gh с github.com/cli/cli в ~/.vibe/bin (Mac или Windows без winget). */
async function downloadGh() {
  // версию берём из редиректа страницы «latest», а не из API (у API лимит на запросы без входа)
  const latest = await fetch("https://github.com/cli/cli/releases/latest", { redirect: "manual" });
  const tag = (latest.headers.get("location") || "").split("/tag/")[1];
  if (!tag) throw new Error("не узнал версию gh (github.com недоступен?)");
  const ver = tag.replace(/^v/, "");
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  const name = `gh_${ver}_` + (win ? `windows_${arch}.zip` : mac ? `macOS_${arch}.zip` : `linux_${arch}.tar.gz`);
  fs.mkdirSync(vibeBin, { recursive: true });
  const tmp = path.join(vibeBin, "_" + name);
  const dl = await fetch(`https://github.com/cli/cli/releases/download/${tag}/${name}`);
  if (!dl.ok) throw new Error(`не скачался ${name} (${dl.status})`);
  fs.writeFileSync(tmp, Buffer.from(await dl.arrayBuffer()));
  const out = path.join(vibeBin, "_gh-unpacked");
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const r = win ? spawnSync("powershell", ["-NoProfile", "-Command", "Expand-Archive -Force -LiteralPath $env:VIBE_ZIP -DestinationPath $env:VIBE_OUT"], { env: { ...process.env, VIBE_ZIP: tmp, VIBE_OUT: out } })
    : tmp.endsWith(".zip") ? spawnSync("unzip", ["-o", "-q", tmp, "-d", out]) : spawnSync("tar", ["xzf", tmp, "-C", out]);
  if (r.status !== 0) throw new Error("не распаковался архив gh");
  const want = win ? "gh.exe" : "gh";
  const find = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { const x = find(f); if (x) return x; } else if (e.name === want) return f; } return null; };
  const bin = find(out);
  if (!bin) throw new Error("в архиве gh нет исполняемого файла");
  fs.copyFileSync(bin, ghLocal);
  if (!win) fs.chmodSync(ghLocal, 0o755);
  fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(tmp, { force: true });
  return tag;
}

// ---------- --setup / --check ----------
if (has("--download-gh")) { const v = await downloadGh(); ok(`gh ${v} → ${ghLocal}`); process.exit(0); }
if (has("--setup") || has("--check")) {
  const setup = has("--setup");
  let bin = ghPath();
  if (!bin) {
    if (!setup) fail("gh (GitHub CLI) не установлен. Скажи «настрой публикацию»");
    if (win && spawnSync("winget", ["--version"], { encoding: "utf8" }).status === 0) {
      info("ставлю GitHub CLI через winget (полминуты)");
      spawnSync("winget", ["install", "--id", "GitHub.cli", "-e", "--silent", "--accept-source-agreements", "--accept-package-agreements"], { stdio: "inherit" });
      bin = ghPath();
    }
    if (!bin) {
      info(`скачиваю GitHub CLI с github.com в ${vibeBin} (полминуты)`);
      try { const v = await downloadGh(); ok(`GitHub CLI ${v} скачан в ${vibeBin}`); } catch (e) { fail(`не смог скачать gh: ${e.message}. Поставь вручную с https://cli.github.com и повтори «настрой публикацию»`); }
      bin = ghPath();
      if (!bin) fail("gh скачан, но не запускается. Поставь вручную с https://cli.github.com");
    } else ok("GitHub CLI установлен");
  } else ok(`GitHub CLI: ${gh(["--version"]).out.split("\n")[0]}`);

  let user = ghUser();
  if (!user && setup) {
    info("нужен вход в GitHub: сейчас откроется браузер");
    const child = spawn(bin, ["auth", "login", "--web", "-h", "github.com", "-p", "https", "--skip-ssh-key"]);
    let buf = "", opened = false;
    const onData = (d) => {
      buf += d.toString();
      const m = buf.match(/code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/);
      if (m && !opened) {
        opened = true;
        console.log(`\n>>> КОД ДЛЯ БРАУЗЕРА: ${m[1]}\n    В открывшемся окне GitHub введи этот код и нажми «Authorize». Жду до 10 минут.\n`);
        const url = "https://github.com/login/device";
        try { (win ? spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }) : spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" })).unref(); } catch {}
      }
    };
    child.stdout.on("data", onData); child.stderr.on("data", onData);
    const code = await new Promise((res) => { const t = setTimeout(() => { child.kill(); res(-1); }, 10 * 60 * 1000); child.on("exit", (c) => { clearTimeout(t); res(c); }); });
    if (code !== 0) fail(code === -1 ? "вход не подтверждён за 10 минут. Повтори «настрой публикацию»" : `вход не удался: ${buf.split("\n").slice(-3).join(" ")}`);
    user = ghUser();
  }
  if (!user) fail("вход в GitHub не выполнен. Скажи «настрой публикацию»");
  ok(`вход в GitHub: ${user.login}`);
  if (setup) { gh(["auth", "setup-git"]); ok("git будет использовать этот вход для публикации"); }
  const g = spawnSync("git", ["--version"], { encoding: "utf8" });
  if (g.status !== 0) fail(win ? "git не найден. Установи Git for Windows (git-scm.com) и повтори «настрой публикацию»" : "git не найден. Выполни в Терминале: xcode-select --install, потом повтори «настрой публикацию»");
  ok(g.stdout.trim());
  console.log("\nГОТОВО: можно публиковать сайты фразой «опубликуй»");
  process.exit(0);
}

// ---------- сайт ----------
const site = argv.find((a) => !a.startsWith("--") && a !== flag("--name") && a !== flag("--message") && a !== flag("--search"));
if (!site) fail("укажи папку сайта");
const siteDir = path.resolve(site);
const indexFile = path.join(siteDir, "index.html");
if (!fs.existsSync(indexFile)) fail(`в ${siteDir} нет index.html`);
const pub = path.join(siteDir, ".publish");
const cfgFile = path.join(pub, "publish.json");
const cfg = fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, "utf8")) : {};
const user = ghUser();
if (!user) fail("нет входа в GitHub. Скажи «настрой публикацию»");
const git = (args, opts = {}) => {
  const r = spawnSync("git", ["-c", `user.name=${user.login}`, "-c", `user.email=${user.email}`, ...args], { cwd: pub, encoding: "utf8", ...opts });
  return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
};
const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const NOINDEX = '<meta name="robots" content="noindex, nofollow" data-publish>';

function translit(s) {
  const map = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
  return s.toLowerCase().split("").map((c) => map[c] ?? c).join("").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 60) || "site";
}

function copyTree(src, dst) {
  fs.rmSync(dst, { recursive: true, force: true });
  // не fs.cpSync: на папках Яндекс.Диска он молча роняет Node (код 127)
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) { const a = path.join(src, e.name), b = path.join(dst, e.name); e.isDirectory() ? copyTree(a, b) : fs.copyFileSync(a, b); }
}
function stage() {
  fs.mkdirSync(pub, { recursive: true });
  let html = fs.readFileSync(indexFile, "utf8").replace(/\r\n/g, "\n");
  html = html.replace(/\n?<meta name="robots"[^>]*data-publish>/g, "");
  if (cfg.search !== "on" && !/name="robots"/.test(html)) html = html.replace(/(<meta charset[^>]*>)/i, `$1\n${NOINDEX}`);
  fs.writeFileSync(path.join(pub, "index.html"), html);
  for (const f of ["vibe.css", "vibe.js"]) {
    const src = [path.join(siteDir, f), path.join(siteDir, "engine", f), path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "engine", f)].find((p) => fs.existsSync(p));
    if (!src) fail(`не найден ${f} (должен лежать рядом с index.html)`);
    fs.copyFileSync(src, path.join(pub, f));
  }
  const assets = path.join(siteDir, "assets");
  if (fs.existsSync(assets)) copyTree(assets, path.join(pub, "assets"));
  fs.writeFileSync(path.join(pub, ".nojekyll"), "");
  fs.writeFileSync(path.join(pub, ".gitignore"), "publish.json\n");
}
function unstageBack() {
  // вернуть файлы из .publish в папку сайта (после отката)
  let html = fs.readFileSync(path.join(pub, "index.html"), "utf8").replace(/\n?<meta name="robots"[^>]*data-publish>/g, "");
  fs.writeFileSync(indexFile, html);
  for (const f of ["vibe.css", "vibe.js"]) if (fs.existsSync(path.join(pub, f)) && fs.existsSync(path.join(siteDir, f))) fs.copyFileSync(path.join(pub, f), path.join(siteDir, f));
  if (fs.existsSync(path.join(pub, "assets"))) copyTree(path.join(pub, "assets"), path.join(siteDir, "assets"));
}
function saveCfg() { fs.mkdirSync(pub, { recursive: true }); fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2)); }

async function waitLive(sha) {
  const started = Date.now();
  while (Date.now() - started < 4 * 60 * 1000) {
    const r = gh(["api", `repos/${cfg.owner}/${cfg.repo}/pages/builds/latest`, "--jq", "[.status, .commit] | @tsv"]);
    const [status, commit] = r.out.split("\t");
    if (status === "built" && commit === sha) return Math.round((Date.now() - started) / 1000);
    if (status === "errored") fail(`GitHub не собрал страницу: ${gh(["api", `repos/${cfg.owner}/${cfg.repo}/pages/builds/latest`, "--jq", ".error.message"]).out}`);
    await new Promise((res) => setTimeout(res, 5000));
  }
  return null;
}

// ---------- --history ----------
if (has("--history")) {
  if (!fs.existsSync(path.join(pub, ".git"))) fail("сайт ещё не публиковался");
  console.log(git(["log", "--format=%h  %ad  %s", "--date=format:%d.%m.%Y %H:%M"]).out);
  console.log(`\nСсылка: ${cfg.url}`);
  process.exit(0);
}

// ---------- --search on|off ----------
if (flag("--search")) {
  cfg.search = flag("--search") === "on" ? "on" : "off";
  saveCfg();
  ok(cfg.search === "on" ? "сайт будет открыт для поисковиков при следующей публикации" : "сайт закрыт для поисковиков (noindex)");
  if (!has("--rollback")) info("теперь «опубликуй», чтобы применить");
  process.exit(0);
}

// ---------- --rollback ----------
if (has("--rollback")) {
  if (!fs.existsSync(path.join(pub, ".git"))) fail("сайт ещё не публиковался, откатывать нечего");
  const count = Number(git(["rev-list", "--count", "HEAD"]).out);
  if (count < 2) fail("это первая публикация, предыдущей версии нет");
  const last = git(["log", "-1", "--format=%s"]).out;
  const r = git(["revert", "--no-edit", "HEAD"]);
  if (r.code !== 0) fail(`откат не прошёл: ${r.err}`);
  git(["push", "-q", "origin", "main"]);
  unstageBack();
  const sec = await waitLive(git(["rev-parse", "HEAD"]).out);
  ok(`откачена публикация «${last}», файлы в папке сайта тоже возвращены`);
  console.log(sec === null ? `Ссылка та же: ${cfg.url} (GitHub ещё обновляет, подожди минуту)` : `На сайте через ${sec} с: ${cfg.url}`);
  process.exit(0);
}

// ---------- публикация ----------
if (!cfg.repo) {
  cfg.owner = user.login;
  cfg.repo = flag("--name") ? translit(flag("--name")) : translit(path.basename(siteDir));
  cfg.url = `https://${user.login}.github.io/${cfg.repo}/`;
  cfg.search = cfg.search || "off";
}
stage();
saveCfg();
const fresh = !fs.existsSync(path.join(pub, ".git"));
if (fresh) {
  git(["init", "-q", "-b", "main"]);
  const exists = gh(["repo", "view", `${cfg.owner}/${cfg.repo}`, "--json", "name"]).code === 0;
  if (exists) {
    info(`репозиторий ${cfg.repo} уже есть, подключаюсь к нему`);
    git(["remote", "add", "origin", `https://github.com/${cfg.owner}/${cfg.repo}.git`]);
    if (git(["fetch", "-q", "origin", "main"]).code === 0) git(["reset", "-q", "--soft", "origin/main"]);
  }
}
git(["add", "-A"]);
if (!git(["status", "--porcelain"]).out) {
  console.log(`Изменений нет, сайт уже актуален: ${cfg.url}`);
  process.exit(0);
}
const message = flag("--message") || (fresh ? `Первая публикация ${stamp()}` : `Публикация ${stamp()}`);
const c = git(["commit", "-q", "-m", message]);
if (c.code !== 0) fail(`git commit: ${c.err || c.out}`);
if (fresh && git(["remote"]).out === "") {
  info(`создаю репозиторий ${cfg.owner}/${cfg.repo}`);
  const r = gh(["repo", "create", `${cfg.owner}/${cfg.repo}`, "--public", "--source", ".", "--push", "--description", "Сайт собран скиллом «Вайб-сайт»"], { cwd: pub });
  if (r.code !== 0) fail(`не смог создать репозиторий: ${r.err}`);
} else {
  const p = git(["push", "-q", "-u", "origin", "main"]);
  if (p.code !== 0) fail(`git push: ${p.err}`);
}
if (fresh) {
  const r = gh(["api", "-X", "POST", `repos/${cfg.owner}/${cfg.repo}/pages`, "-f", "build_type=legacy", "-f", "source[branch]=main", "-f", "source[path]=/"]);
  if (r.code === 0) ok(`GitHub Pages включён для ${cfg.repo}`);
  else if (/already|409/i.test(r.err + r.out)) ok(`GitHub Pages уже был включён для ${cfg.repo}`);
  else fail(`не смог включить GitHub Pages: ${r.err || r.out}`);
}
const sec = await waitLive(git(["rev-parse", "HEAD"]).out);
ok(`опубликовано: «${message}»`);
if (cfg.search !== "on") info("сайт закрыт для поисковиков (демо). Открыть: «открой сайт для поисковиков»");
console.log(sec === null ? `Ссылка: ${cfg.url} (GitHub ещё собирает, обычно минута)` : `На сайте через ${sec} с: ${cfg.url}`);
