// Бот-продавец веб-мастера: Cloudflare Worker, Telegram webhook, без ИИ – только кнопки и бриф.
// Конфиг (CONFIG) вписывает скрипт сборки bot.mjs из bot.json. Секреты: BOT_TOKEN, WEBHOOK_SECRET.
// Хранилище STATE (KV): шаг брифа и ответы каждого клиента, живут 2 суток.
const CONFIG = /*CONFIG*/{};

const api = (env, method, body) => fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}).then((r) => r.json()).catch(() => ({ ok: false }));

const menu = () => {
  const rows = [
    [{ text: "Посмотреть работы", callback_data: "works" }],
    [{ text: "Цены", callback_data: "prices" }, { text: "Как работаю", callback_data: "how" }],
    [{ text: "Оставить заявку", callback_data: "lead" }],
  ];
  if (CONFIG.vitrinaUrl) rows.push([{ text: "Моя витрина", url: CONFIG.vitrinaUrl }]);
  return { inline_keyboard: rows };
};
const back = { inline_keyboard: [[{ text: "Оставить заявку", callback_data: "lead" }], [{ text: "Меню", callback_data: "menu" }]] };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const kindLabel = { real: "Реальный заказ", study: "Учебный кейс", demo: "Демо-проект" };

async function showMenu(env, chat, first) {
  const text = first ? CONFIG.greeting : "Что посмотрим?";
  await api(env, "sendMessage", { chat_id: chat, text, parse_mode: "HTML", reply_markup: menu() });
}

async function showWorks(env, chat) {
  const cases = CONFIG.cases || [];
  if (!cases.length) return api(env, "sendMessage", { chat_id: chat, text: "Работы скоро появятся здесь.", reply_markup: back });
  for (const c of cases.slice(0, 6)) {
    const lines = [`<b>${esc(c.title)}</b>`, [c.niche, c.city].filter(Boolean).map(esc).join(" · "), `<i>${kindLabel[c.kind] || kindLabel.demo}</i>`];
    if (c.task) lines.push("", `Задача: ${esc(c.task)}`);
    if (c.result) lines.push(`Результат: ${esc(c.result)}`);
    if (!c.task && c.about) lines.push("", esc(c.about));
    if (c.quote) lines.push("", `«${esc(c.quote)}»`);
    const caption = lines.join("\n").slice(0, 1000);
    const kb = c.url ? { inline_keyboard: [[{ text: "Открыть сайт", url: c.url }]] } : undefined;
    const sent = c.photo ? await api(env, "sendPhoto", { chat_id: chat, photo: c.photo, caption, parse_mode: "HTML", reply_markup: kb }) : { ok: false };
    if (!sent.ok) await api(env, "sendMessage", { chat_id: chat, text: caption, parse_mode: "HTML", reply_markup: kb, disable_web_page_preview: true });
  }
  await api(env, "sendMessage", { chat_id: chat, text: "Хотите такой же сайт для своего бизнеса?", reply_markup: back });
}

async function showPrices(env, chat) {
  const s = (CONFIG.services || []).map((x) => `<b>${esc(x.title)}</b> – ${esc(x.price || "по запросу")}\n${esc(x.desc || "")}`).join("\n\n");
  await api(env, "sendMessage", { chat_id: chat, text: (s || "Цены назову, когда увижу задачу.") + "\n\nДемо вашего сайта – бесплатно.", parse_mode: "HTML", reply_markup: back });
}

async function showHow(env, chat) {
  const s = (CONFIG.steps || []).map(([t, p], i) => `${i + 1}. <b>${esc(t)}</b> – ${esc(p)}`).join("\n");
  await api(env, "sendMessage", { chat_id: chat, text: s, parse_mode: "HTML", reply_markup: back });
}

// бриф: вопросы по одному, у части – готовые варианты кнопками
async function ask(env, chat, step) {
  const q = CONFIG.brief[step];
  const kb = q.options ? { inline_keyboard: q.options.map((o, i) => [{ text: o, callback_data: `opt:${i}` }]) } : undefined;
  const contact = q.contact ? { keyboard: [[{ text: "Отправить мой номер", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } : undefined;
  await api(env, "sendMessage", { chat_id: chat, text: `${step + 1}/${CONFIG.brief.length}. ${q.q}`, reply_markup: kb || contact || { remove_keyboard: true } });
}

async function answer(env, chat, from, text) {
  const key = `s:${chat}`;
  const st = JSON.parse((await env.STATE.get(key)) || "null");
  if (!st) return false;
  st.answers.push(text);
  st.step += 1;
  if (st.step < CONFIG.brief.length) {
    await env.STATE.put(key, JSON.stringify(st), { expirationTtl: 172800 });
    await ask(env, chat, st.step);
    return true;
  }
  await env.STATE.delete(key);
  await api(env, "sendMessage", { chat_id: chat, text: CONFIG.thanks, reply_markup: { remove_keyboard: true } });
  await api(env, "sendMessage", { chat_id: chat, text: "Пока ждёте – можно посмотреть работы:", reply_markup: menu() });
  const who = from.username ? `@${from.username}` : esc([from.first_name, from.last_name].filter(Boolean).join(" "));
  const body = CONFIG.brief.map((q, i) => `<b>${esc(q.short || q.q)}</b>\n${esc(st.answers[i] || "–")}`).join("\n\n");
  await api(env, "sendMessage", {
    chat_id: CONFIG.ownerChatId, parse_mode: "HTML",
    text: `🔥 <b>Тёплая заявка из бота</b>\nОт: ${who}\n\n${body}\n\n<i>Человек сам прошёл бриф – напишите ему в ближайший час.</i>`,
    reply_markup: { inline_keyboard: [[{ text: "Написать клиенту", url: from.username ? `https://t.me/${from.username}` : `tg://user?id=${from.id}` }]] },
  });
  return true;
}

async function handle(update, env) {
  if (update.callback_query) {
    const cq = update.callback_query, chat = cq.message.chat.id, d = cq.data;
    await api(env, "answerCallbackQuery", { callback_query_id: cq.id });
    if (d === "menu") return showMenu(env, chat, false);
    if (d === "works") return showWorks(env, chat);
    if (d === "prices") return showPrices(env, chat);
    if (d === "how") return showHow(env, chat);
    if (d === "lead") {
      await env.STATE.put(`s:${chat}`, JSON.stringify({ step: 0, answers: [] }), { expirationTtl: 172800 });
      await api(env, "sendMessage", { chat_id: chat, text: CONFIG.leadIntro });
      return ask(env, chat, 0);
    }
    if (d.startsWith("opt:")) {
      const st = JSON.parse((await env.STATE.get(`s:${chat}`)) || "null");
      const q = st && CONFIG.brief[st.step];
      if (q && q.options) return answer(env, chat, cq.from, q.options[Number(d.slice(4))] || "");
    }
    return;
  }
  const m = update.message;
  if (!m || m.chat.type !== "private") return;
  const chat = m.chat.id;
  if (m.text && m.text.startsWith("/start")) { await env.STATE.delete(`s:${chat}`); return showMenu(env, chat, true); }
  if (String(chat) === String(CONFIG.ownerChatId) && m.text === "/test") {
    return api(env, "sendMessage", { chat_id: chat, text: "Бот на связи. Заявки будут приходить сюда." });
  }
  const text = m.contact ? m.contact.phone_number : m.text || (m.photo ? "[фото]" : m.voice ? "[голосовое]" : "[сообщение]");
  if (await answer(env, chat, m.from, text)) return;
  // свободное сообщение вне брифа – тоже не теряем: пересылаем владельцу
  if (String(chat) !== String(CONFIG.ownerChatId)) {
    await api(env, "forwardMessage", { chat_id: CONFIG.ownerChatId, from_chat_id: chat, message_id: m.message_id });
    await api(env, "sendMessage", { chat_id: chat, text: "Передал сообщение – отвечу в ближайшее время. А пока можно посмотреть:", reply_markup: menu() });
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("Бот работает", { status: 200 });
    if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
    const update = await request.json().catch(() => null);
    if (update) ctx.waitUntil(handle(update, env).catch(() => {}));
    return new Response("ok");
  },
};
