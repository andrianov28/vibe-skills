#!/usr/bin/env node
/**
 * Заказчик с Kwork для плашки «демо под заказчика»: имя, аватар, название заказа.
 *
 *   node zakazchik.mjs <ссылка на заказ kwork.ru/projects/NNN> <папка сайта>
 *
 * Берёт публичную страницу заказа (логин не нужен): window.stateData → wantData.user
 * (username, profilePictureSrcSet) и wantData.name. Имя для показа берёт со страницы
 * профиля, если оно там есть, иначе логин. Аватар скачивает в <папка>/assets/zakazchik.jpg
 * (160×160, jpeg), данные пишет в <папка>/zakazchik.json. Если аватара нет – файл не
 * создаётся, в json "avatar": null.
 */
import fs from "node:fs";
import path from "node:path";
import { requireFromBuild } from "./vibe-env.mjs";

const [url, siteArg] = process.argv.slice(2);
if (!url || !siteArg) { console.error("использование: node zakazchik.mjs <ссылка на заказ> <папка сайта>"); process.exit(1); }
const site = path.resolve(siteArg);
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36", "Accept-Language": "ru" };

function stateData(html) {
  const i = html.indexOf("window.stateData");
  if (i === -1) throw new Error("на странице нет window.stateData – биржа сменила формат или отдала капчу");
  const st = html.indexOf("{", i); let d = 0, j = st;
  for (; j < html.length; j++) {
    const c = html[j];
    if (c === "{") d++; else if (c === "}") { d--; if (d === 0) break; }
    else if (c === '"') { j++; while (j < html.length && html[j] !== '"') { if (html[j] === "\\") j++; j++; } }
  }
  return JSON.parse(html.slice(st, j + 1));
}
const get = async (u) => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r; };

try {
  const m = url.match(/kwork\.ru\/projects\/(\d+)/);
  if (!m) throw new Error("нужна ссылка вида https://kwork.ru/projects/NNN");
  const orderUrl = `https://kwork.ru/projects/${m[1]}`;
  const s = stateData(await (await get(orderUrl)).text());
  const w = s.wantData || {};
  const u = w.user || {};
  if (!u.username) throw new Error("в карточке нет данных заказчика (заказ снят или закрыт?)");

  // имя для показа: из заголовка страницы профиля («Фрилансер Николай Владимирович (login) … - Kwork»), иначе логин
  let name = u.username;
  try {
    const html = await (await get(`https://kwork.ru/user/${u.username}`)).text();
    const t = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || "";
    const mm = t.match(new RegExp(`^\\s*(?:Фрилансер|Покупатель|Заказчик|Пользователь)?\\s*(.+?)\\s*\\(${u.username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`, "i"));
    if (mm && mm[1].trim() && mm[1].trim().toLowerCase() !== u.username.toLowerCase()) name = mm[1].trim();
  } catch {}

  let avatar = null;
  const src = (u.profilePictureSrcSet || "").split(",")[0].trim().split(" ")[0];
  if (src && !/noprofile/.test(u.profilepicture || "")) {
    const sharp = requireFromBuild("sharp");
    if (!sharp) throw new Error("не найден sharp: запусти node setup.mjs");
    const buf = Buffer.from(await (await get(src)).arrayBuffer());
    fs.mkdirSync(path.join(site, "assets"), { recursive: true });
    avatar = "assets/zakazchik.jpg";
    await sharp(buf).resize(160, 160, { fit: "cover" }).jpeg({ quality: 84 }).toFile(path.join(site, avatar));
  }
  const out = { url: orderUrl, username: u.username, name, title: w.name || "", avatar, fetched: new Date().toISOString().slice(0, 10) };
  fs.writeFileSync(path.join(site, "zakazchik.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`заказчик: ${name}${name !== u.username ? ` (${u.username})` : ""}`);
  console.log(`заказ: «${out.title}»`);
  console.log(avatar ? `аватар: ${avatar} (160×160)` : "аватар: у заказчика нет фото, плашка будет без него");
  console.log(`записано: ${path.join(site, "zakazchik.json")}`);
} catch (e) { console.error("ОШИБКА:", e.message); process.exit(1); }
