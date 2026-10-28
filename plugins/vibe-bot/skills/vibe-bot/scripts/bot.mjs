#!/usr/bin/env node
/**
 * Бот-продавец веб-мастера: Telegram-бот на кнопках, живёт в Cloudflare Workers (бесплатно, без карты).
 *
 *   node bot.mjs init  "<папка бота>" [--vitrina "<папка витрины>"]   собрать bot.json из витрины, подготовить файл токена
 *   node bot.mjs open-env "<папка бота>"                             открыть файл токена в Блокноте
 *   node bot.mjs token "<папка бота>"                                проверить токен (getMe)
 *   node bot.mjs owner "<папка бота>"                                запомнить чат владельца (после /start от ученика)
 *   node bot.mjs login                                               вход в Cloudflare через браузер (wrangler login)
 *   node bot.mjs deploy "<папка бота>"                               выложить бота в Cloudflare и подключить к Telegram
 *   node bot.mjs check "<папка бота>"                                проверить связь: вебхук + тестовое сообщение владельцу
 *   node bot.mjs refresh "<папка бота>" [--vitrina "<папка витрины>"] обновить работы и цены из витрины (потом deploy)
 *   node bot.mjs zayavki "<папка бота>"                              забрать заявки из Cloudflare в заявки.json (их показывает пульт)
 *
 * Токен бота – только в файле .env папки бота (BOT_TOKEN=…), в чат его не вставлять.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const TPL = path.join(here, "..", "templates", "worker.js");
const [cmd, ...rest] = process.argv.slice(2);
const flag = (n) => { const i = rest.indexOf(n); return i > -1 ? rest[i + 1] : null; };
const dirArg = rest.find((a) => !a.startsWith("--") && a !== flag("--vitrina"));
const ok = (s) => console.log("✓ " + s), info = (s) => console.log("  " + s), fail = (s) => { console.error("✗ " + s); process.exit(1); };
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const WR = ["-y", "wrangler@4"];

function wrangler(args, opts = {}) {
  const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", [...WR, ...args], { encoding: "utf8", shell: process.platform === "win32", ...opts });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function readEnv(dir) {
  const f = path.join(dir, ".env"), env = {};
  if (fs.existsSync(f)) for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
  return env;
}
function writeEnv(dir, env) {
  fs.writeFileSync(path.join(dir, ".env"), Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  fs.writeFileSync(path.join(dir, ".gitignore"), ".env\n.wrangler/\n");
}
const tg = (token, method, body) => fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) }).then((r) => r.json()).catch((e) => ({ ok: false, description: e.message }));
function token(dir) { const t = readEnv(dir).BOT_TOKEN; if (!t || !/^\d+:[\w-]{30,}$/.test(t)) fail("токена нет или он неполный: скажи «открой файл токена», вставь токен от BotFather после BOT_TOKEN= и сохрани"); return t; }

// ---------- конфиг бота из витрины ----------
function fromVitrina(vdir, prev = {}) {
  const v = readJson(path.join(vdir, "vitrina.json"));
  let url = ""; try { url = readJson(path.join(vdir, ".publish", "publish.json")).url || ""; } catch {}
  const first = (v.name || "").split(" ")[0];
  return {
    name: v.name,
    vitrinaUrl: url,
    policyUrl: url && v.policyFile ? new URL(v.policyFile, url).href : "",
    ai: prev.ai || false,
    greeting: prev.greeting || `Здравствуйте! Это бот-помощник: ${v.name || "веб-мастер"} делает сайты для малого бизнеса.\n\nЗдесь можно посмотреть работы, цены и оставить заявку – ${first || "мастер"} ответит лично.`,
    cases: (v.cases || []).map((c) => ({ title: c.title, niche: c.niche, city: c.city, kind: c.kind || "demo", url: c.url, about: c.about, task: c.task, result: c.result, quote: c.quote,
      // jpg-копию снимка кладёт сборка витрины; Telegram по ссылке webp не показывает
      photo: url && c.desktop && fs.existsSync(path.join(vdir, c.desktop.replace(/\.webp$/, ".jpg"))) ? new URL(c.desktop.replace(/\.webp$/, ".jpg"), url).href : "" })),
    services: v.services || [],
    steps: prev.steps || [["Демо до оплаты", "собираю демо вашего сайта по карточке на Картах или вашему описанию"], ["Правки словами", "говорите, что поменять, – меняю в тот же день"], ["Ваш адрес", "переношу сайт на ваш домен или в вашу Тильду"], ["Готово", "сайт работает и приводит заявки"]],
    leadIntro: prev.leadIntro || "Отлично! Четыре коротких вопроса – и я передам заявку. Отвечайте как удобно.",
    brief: prev.brief || [
      { q: "Какой у вас бизнес и в каком городе?", short: "Бизнес и город" },
      { q: "Сайт сейчас есть?", short: "Сайт сейчас", options: ["Нет сайта", "Есть, но старый", "Есть только карточка на Картах"] },
      { q: "Что важнее всего на сайте? Например: запись, цены, фото работ.", short: "Что важно" },
      { q: "Как с вами связаться? Напишите номер или нажмите кнопку ниже.", short: "Контакт", contact: true },
    ],
    thanks: prev.thanks || `Спасибо! Заявка передана – ${first || "мастер"} ответит в течение дня.`,
    ownerChatId: prev.ownerChatId || "",
    botUsername: prev.botUsername || "",
    workerUrl: prev.workerUrl || "",
    kvId: prev.kvId || "",
  };
}
const cfgPath = (d) => path.join(d, "bot.json");
const findVitrina = (d) => flag("--vitrina") || [path.join(path.dirname(d), "vitrina"), path.join(process.cwd(), "vitrina")].find((p) => fs.existsSync(path.join(p, "vitrina.json")));

// ---------- команды ----------
if (cmd === "init" || cmd === "refresh") {
  if (!dirArg) fail("нужна папка бота");
  const dir = path.resolve(dirArg); fs.mkdirSync(dir, { recursive: true });
  const prev = fs.existsSync(cfgPath(dir)) ? readJson(cfgPath(dir)) : {};
  const v = findVitrina(dir);
  if (!v) fail("не нашёл витрину (vitrina.json): сначала «собери мою витрину» или укажи --vitrina <папка>");
  const cfg = fromVitrina(path.resolve(v), cmd === "refresh" ? prev : prev);
  fs.writeFileSync(cfgPath(dir), JSON.stringify(cfg, null, 2));
  if (!fs.existsSync(path.join(dir, ".env"))) writeEnv(dir, { BOT_TOKEN: "" });
  ok(`bot.json: ${cfg.cases.length} работ, ${cfg.services.length} услуг, бриф из ${cfg.brief.length} вопросов (из витрины ${v})`);
  if (cfg.vitrinaUrl && cfg.cases.length && !cfg.cases.some((c) => c.photo)) info("у работ нет снимков для бота: пересобери витрину (vitrina.mjs build) и опубликуй её – появятся jpg-копии, потом «обнови бота»");
  if (!cfg.vitrinaUrl) info("витрина ещё не опубликована – в боте не будет кнопки «Моя витрина» и картинок работ. Скажи «опубликуй витрину», потом «обнови бота»");
  if (!readEnv(dir).BOT_TOKEN) info("токена ещё нет: «открой файл токена»");
} else if (cmd === "open-env") {
  const dir = path.resolve(dirArg || "."); if (!fs.existsSync(path.join(dir, ".env"))) writeEnv(dir, { BOT_TOKEN: "" });
  const f = path.join(dir, ".env");
  spawn(process.platform === "win32" ? "notepad" : process.platform === "darwin" ? "open" : "xdg-open", process.platform === "darwin" ? ["-e", f] : [f], { detached: true, stdio: "ignore" }).unref();
  ok(`открыл ${f}: вставь токен после BOT_TOKEN= , сохрани и закрой`);
} else if (cmd === "token") {
  const dir = path.resolve(dirArg || "."); const me = await tg(token(dir), "getMe");
  if (!me.ok) fail(`Telegram не принял токен: ${me.description || "нет связи"}. Скопируй токен у BotFather заново`);
  const cfg = fs.existsSync(cfgPath(dir)) ? readJson(cfgPath(dir)) : {}; cfg.botUsername = me.result.username; fs.writeFileSync(cfgPath(dir), JSON.stringify(cfg, null, 2));
  ok(`токен работает: бот @${me.result.username} (${me.result.first_name})`);
} else if (cmd === "owner") {
  const dir = path.resolve(dirArg || "."); const t = token(dir); const cfg = readJson(cfgPath(dir));
  await tg(t, "deleteWebhook", {});
  const up = await tg(t, "getUpdates", { allowed_updates: ["message"] });
  const msgs = (up.result || []).map((u) => u.message).filter((m) => m && m.chat && m.chat.type === "private");
  if (!msgs.length) fail(`боту ещё никто не писал: открой t.me/${cfg.botUsername || "твой_бот"}, нажми «Старт» и повтори`);
  const m = msgs[msgs.length - 1];
  cfg.ownerChatId = String(m.chat.id); fs.writeFileSync(cfgPath(dir), JSON.stringify(cfg, null, 2));
  ok(`заявки будут приходить в чат ${[m.chat.first_name, m.chat.last_name].filter(Boolean).join(" ")}${m.chat.username ? " (@" + m.chat.username + ")" : ""}`);
  if (cfg.workerUrl) info("бот уже выкладывался – повтори «выложи бота», чтобы снова подключить его к Telegram");
} else if (cmd === "login") {
  const who = wrangler(["whoami"]);
  if (/You are logged in|associated with the email/i.test(who.out)) { ok("вход в Cloudflare уже есть"); process.exit(0); }
  info("открываю браузер: войди или зарегистрируйся в Cloudflare и нажми «Allow»");
  const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", [...WR, "login"], { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) fail("вход не завершён – повтори «войди в Cloudflare»");
  ok("вход в Cloudflare есть");
} else if (cmd === "deploy") {
  const dir = path.resolve(dirArg || "."); const t = token(dir); const cfg = readJson(cfgPath(dir));
  if (!cfg.ownerChatId) fail("не знаю, куда слать заявки: открой своего бота в Telegram, нажми «Старт», потом скажи «запомни мой чат»");
  const who = wrangler(["whoami"]);
  if (!/You are logged in|associated with the email/i.test(who.out)) fail("нет входа в Cloudflare: скажи «войди в Cloudflare»");
  if (!cfg.botUsername) { const me = await tg(t, "getMe"); cfg.botUsername = me.result?.username || ""; }
  const name = ("bot-" + (cfg.botUsername || "vitrina")).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60);
  // хранилище брифа (KV) – один раз
  if (!cfg.kvId) {
    const r = wrangler(["kv", "namespace", "create", `${name}-state`], { cwd: dir });
    const m = r.out.match(/id\s*[=:]\s*"([0-9a-f]{32})"/) || r.out.match(/\b([0-9a-f]{32})\b/);
    if (!m) fail(`не смог создать хранилище в Cloudflare:\n${r.out.slice(-800)}`);
    cfg.kvId = m[1]; ok("хранилище для брифа создано");
  }
  const src = fs.readFileSync(TPL, "utf8").replace("/*CONFIG*/{}", JSON.stringify({ ...cfg, kvId: undefined, workerUrl: undefined }));
  fs.writeFileSync(path.join(dir, "worker.js"), src);
  fs.writeFileSync(path.join(dir, "wrangler.toml"), `name = "${name}"\nmain = "worker.js"\ncompatibility_date = "2026-01-01"\nworkers_dev = true\n\n[[kv_namespaces]]\nbinding = "STATE"\nid = "${cfg.kvId}"\n`);
  const d = wrangler(["deploy"], { cwd: dir });
  const url = (d.out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i) || [])[0];
  if (!url) {
    if (/subdomain/i.test(d.out)) fail("у аккаунта Cloudflare ещё нет адреса workers.dev: открой dash.cloudflare.com → «Workers и Pages» один раз (адрес создастся), потом повтори «выложи бота»");
    fail(`Cloudflare не принял бота:\n${d.out.slice(-1200)}`);
  }
  cfg.workerUrl = url; fs.writeFileSync(cfgPath(dir), JSON.stringify(cfg, null, 2));
  const env = readEnv(dir); env.WEBHOOK_SECRET = env.WEBHOOK_SECRET || crypto.randomBytes(24).toString("hex"); writeEnv(dir, env);
  for (const [k, v] of [["BOT_TOKEN", t], ["WEBHOOK_SECRET", env.WEBHOOK_SECRET]]) {
    const s = wrangler(["secret", "put", k], { cwd: dir, input: v + "\n" });
    if (s.code !== 0) fail(`не смог сохранить секрет ${k} в Cloudflare:\n${s.out.slice(-600)}`);
  }
  const wh = await tg(t, "setWebhook", { url, secret_token: env.WEBHOOK_SECRET, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  if (!wh.ok) fail(`Telegram не подключился к боту: ${wh.description}`);
  await tg(t, "setMyDescription", { description: cfg.greeting.slice(0, 500) });
  await tg(t, "setMyShortDescription", { short_description: `Сайты для бизнеса – работы, цены, заявка. ${cfg.name || ""}`.slice(0, 120) });
  await tg(t, "setMyCommands", { commands: [{ command: "start", description: "Меню" }] });
  ok(`бот работает: t.me/${cfg.botUsername} (живёт в Cloudflare, компьютер можно выключать)`);
} else if (cmd === "ai-on" || cmd === "ai-off") {
  // «подключи мозги» / «отключи мозги»: ChatGPT через kie.ai отвечает на свободные вопросы клиентов как продавец
  const dir = path.resolve(dirArg || "."); const cfg = readJson(cfgPath(dir));
  if (!cfg.workerUrl) fail("бот ещё не выложен: сначала «выложи бота»");
  if (cmd === "ai-on") {
    const home = process.env.USERPROFILE || process.env.HOME || "";
    const files = [path.join(home, ".vibe", ".env"), path.join(dir, ".env")];
    let key = process.env.KIE_AI_API_KEY || "";
    for (const f of files) { if (key) break; try { const m = fs.readFileSync(f, "utf8").match(/^\s*KIE_AI_API_KEY\s*=\s*(.+?)\s*$/m); if (m && m[1]) key = m[1].replace(/^["']|["']$/g, ""); } catch {} }
    if (!key) fail("нет ключа kie.ai: скажи «открой файл ключа» (скилл «Вайб-сайт»), вставь ключ kie.ai и повтори «подключи мозги»");
    const s = wrangler(["secret", "put", "KIE_KEY"], { cwd: dir, input: key + "\n" });
    if (s.code !== 0) fail(`не смог сохранить ключ kie.ai в Cloudflare:\n${s.out.slice(-600)}`);
    cfg.ai = true;
  } else cfg.ai = false;
  fs.writeFileSync(cfgPath(dir), JSON.stringify(cfg, null, 2));
  ok(cmd === "ai-on" ? "мозги включены: на свободные вопросы клиентов отвечает ChatGPT как продавец (около 0,1 кредита kie.ai за ответ, не больше 20 ответов одному клиенту в сутки). Теперь «выложи бота»" : "мозги выключены: бот снова только на кнопках. Теперь «выложи бота»");
} else if (cmd === "check") {
  const dir = path.resolve(dirArg || "."); const t = token(dir); const cfg = readJson(cfgPath(dir));
  const info2 = await tg(t, "getWebhookInfo");
  const w = info2.result || {};
  if (!w.url) fail("бот не подключён к Telegram: «выложи бота»");
  if (w.last_error_message) console.log(`○ последняя ошибка Telegram: ${w.last_error_message} (${new Date(w.last_error_date * 1000).toLocaleString("ru-RU")})`);
  const ping = await fetch(cfg.workerUrl).then((r) => r.text()).catch(() => "");
  if (!/работает/.test(ping)) console.log("○ адрес бота в Cloudflare не ответил – из России его иногда не видно в браузере, Telegram при этом достучится");
  const s = await tg(t, "sendMessage", { chat_id: cfg.ownerChatId, text: "Проверка: бот на связи, заявки придут сюда." });
  if (!s.ok) fail(`не смог написать тебе: ${s.description}. Открой бота и нажми «Старт», потом «запомни мой чат»`);
  ok(`связь есть: в очереди ${w.pending_update_count || 0}, тебе в Telegram ушло проверочное сообщение`);
} else if (cmd === "zayavki") {
  // забрать заявки из Cloudflare в файл заявки.json папки бота (их же показывает пульт Охотника)
  const dir = path.resolve(dirArg || "."); const cfg = readJson(cfgPath(dir)); const key = readEnv(dir).WEBHOOK_SECRET;
  if (!cfg.workerUrl || !key) fail("бот ещё не выложен: «выложи бота»");
  const r = await fetch(cfg.workerUrl + "/leads", { headers: { "X-Owner-Key": key } }).then((x) => x.json()).catch(() => null);
  if (!r) fail("Cloudflare не ответил – из России адрес бота иногда не открывается, попробуй позже");
  if (!r.ok) fail("бот не отдал заявки: его нужно обновить – «выложи бота» (новая версия умеет хранить заявки для пульта)");
  const f = path.join(dir, "заявки.json");
  const base = fs.existsSync(f) ? readJson(f) : { leads: [] };
  const have = new Set(base.leads.map((l) => l.key));
  const fresh = r.leads.filter((l) => !have.has(l.key)).map((l) => ({ ...l, status: "новая", statusAt: l.at.slice(0, 10) }));
  base.leads.push(...fresh); fs.writeFileSync(f, JSON.stringify(base, null, 2));
  if (r.leads.length) await fetch(cfg.workerUrl + "/leads/done", { method: "POST", headers: { "X-Owner-Key": key, "content-type": "application/json" }, body: JSON.stringify({ keys: r.leads.map((l) => l.key) }) }).catch(() => {});
  ok(`новых заявок: ${fresh.length}, всего в заявки.json: ${base.leads.length}`);
  for (const l of base.leads.filter((x) => x.status === "новая")) info(`${l.at.slice(0, 16).replace("T", " ")} · ${l.who} · ${l.answers.map((a) => a.a).filter(Boolean).join(" · ").slice(0, 140)}`);
} else {
  console.log("команды: init | open-env | token | owner | login | deploy | check | refresh | zayavki");
}
