#!/usr/bin/env node
/**
 * Генерация картинок через kie.ai (модель seedream/5-pro).
 *
 *   node kie.mjs probe                                   баланс кредитов
 *   node kie.mjs still "<промпт>" out.png [--ar 16:9] [--ref a.png] [--quality high]
 *
 * Проверенные форматы: 16:9, 9:16, 3:4, 1:1 (4:5 модель не принимает).
 * Ключ: переменная KIE_AI_API_KEY или файл .env (ищется вверх от текущей папки,
 * потом в папке, указанной в VIBE_ENV_DIR).
 */
import fs from "node:fs";
import path from "node:path";

const API = "https://api.kie.ai";
const UPLOAD = "https://kieai.redpandaai.co/api/file-base64-upload";
const MODEL = "seedream/5-pro-text-to-image";
const MODEL_EDIT = "seedream/5-pro-image-to-image";

function findEnv() {
  const dirs = [];
  let d = process.cwd();
  for (let i = 0; i < 8; i++) { dirs.push(d); const up = path.dirname(d); if (up === d) break; d = up; }
  if (process.env.VIBE_ENV_DIR) dirs.push(process.env.VIBE_ENV_DIR);
  dirs.push(path.join(process.env.USERPROFILE || process.env.HOME || "", ".vibe"));
  for (const dir of dirs) { const p = path.join(dir, ".env"); if (fs.existsSync(p)) return p; }
  return null;
}
function loadKey() {
  if (process.env.KIE_AI_API_KEY) return process.env.KIE_AI_API_KEY;
  const p = findEnv();
  if (!p) throw new Error("KIE_AI_API_KEY не задан и .env не найден");
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*KIE_AI_API_KEY\s*=\s*(.+?)\s*$/);
    if (m && m[1]) return m[1].replace(/^["']|["']$/g, "");
  }
  throw new Error("KIE_AI_API_KEY пустой в " + p);
}
const KEY = loadKey();
const H = { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function uploadLocal(file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error("нет файла: " + abs);
  const ext = path.extname(abs).slice(1).toLowerCase();
  const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  const dataUrl = `data:${mime};base64,${fs.readFileSync(abs).toString("base64")}`;
  const res = await fetch(UPLOAD, { method: "POST", headers: H, body: JSON.stringify({ base64Data: dataUrl, uploadPath: "vibe", fileName: path.basename(abs) }) });
  const j = await res.json();
  const url = j?.data?.downloadUrl || j?.data?.fileUrl || j?.data?.url;
  if (!url) throw new Error("загрузка не удалась: " + JSON.stringify(j));
  return url;
}
const asUrl = (v) => (/^https?:\/\//i.test(v) ? Promise.resolve(v) : uploadLocal(v));

async function createTask(model, input) {
  const res = await fetch(`${API}/api/v1/jobs/createTask`, { method: "POST", headers: H, body: JSON.stringify({ model, input }) });
  const j = await res.json();
  if (j.code !== 200 || !j?.data?.taskId) throw new Error(`createTask ${model}: ${JSON.stringify(j)}`);
  return j.data.taskId;
}
async function waitTask(taskId, label, timeoutMs = 10 * 60 * 1000) {
  const t0 = Date.now(); let delay = 4000;
  for (;;) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`${label}: таймаут`);
    const res = await fetch(`${API}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, { headers: H });
    const j = await res.json(); const d = j?.data || {}; const state = d.state || d.status;
    if (state === "success") {
      let out = d.resultJson; if (typeof out === "string") { try { out = JSON.parse(out); } catch {} }
      const urls = out?.resultUrls || out?.result_urls || out?.urls || [];
      if (!urls.length) throw new Error(`${label}: успех без ссылки: ${JSON.stringify(d)}`);
      return urls;
    }
    if (state === "fail" || state === "failed") throw new Error(`${label} ошибка: ${d.failMsg || d.failCode || JSON.stringify(d)}`);
    process.stderr.write(`  ${label}: ${state || "в очереди"} (${Math.round((Date.now() - t0) / 1000)}с)\n`);
    await sleep(delay); delay = Math.min(delay * 1.25, 15000);
  }
}
async function download(url, out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const res = await fetch(url); if (!res.ok) throw new Error(`скачивание ${res.status} ${url}`);
  fs.writeFileSync(path.resolve(out), Buffer.from(await res.arrayBuffer())); return out;
}
const flag = (argv, name, dflt = null) => { const i = argv.indexOf(name); return i > -1 && argv[i + 1] ? argv[i + 1] : dflt; };
const flags = (argv, name) => argv.reduce((acc, a, i) => (a === name && argv[i + 1] ? acc.concat(argv[i + 1]) : acc), []);

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "probe") {
    const r = await fetch(`${API}/api/v1/chat/credit`, { headers: H }); const j = await r.json();
    console.log("кредитов:", j.data);
  } else if (cmd === "still") {
    const [prompt, out] = rest;
    if (!prompt || !out) throw new Error('использование: kie.mjs still "<промпт>" out.png [--ar 16:9] [--ref a.png]');
    if (fs.existsSync(out) && !rest.includes("--force")) { console.log("уже есть:", out); process.exit(0); }
    const refs = flags(rest, "--ref");
    let model = MODEL;
    const input = { prompt, aspect_ratio: flag(rest, "--ar", "16:9"), quality: flag(rest, "--quality", "high"), output_format: "png", nsfw_checker: false };
    if (refs.length) { model = MODEL_EDIT; input.image_urls = await Promise.all(refs.map(asUrl)); }
    const id = await createTask(model, input);
    const urls = await waitTask(id, path.basename(out));
    await download(urls[0], out); console.log(out);
  } else {
    console.error("node kie.mjs probe | still \"<промпт>\" out.png [--ar 16:9] [--ref a.png]"); process.exit(1);
  }
} catch (e) { console.error("ОШИБКА:", e.message); process.exit(1); }
