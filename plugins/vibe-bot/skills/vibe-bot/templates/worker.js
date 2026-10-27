// Бот-продавец веб-мастера: Cloudflare Worker, Telegram webhook, без ИИ – только кнопки и бриф.
// Конфиг (CONFIG) вписывает скрипт сборки bot.mjs из bot.json. Секреты: BOT_TOKEN, WEBHOOK_SECRET.
// Хранилище STATE (KV): шаг брифа (без телефона) – 2 часа, память разговора с нейросетью – 30 минут, счётчик ответов – сутки.
// Секрет KIE_KEY – ключ kie.ai, если включены «мозги» (CONFIG.ai).
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
  const last = step === CONFIG.brief.length - 1;
  const consent = last ? `

<i>Отправляя заявку, вы соглашаетесь на обработку персональных данных${CONFIG.policyUrl ? ` – <a href="${CONFIG.policyUrl}">политика</a>` : ""}.</i>` : "";
  await api(env, "sendMessage", { chat_id: chat, text: `${step + 1}/${CONFIG.brief.length}. ${esc(q.q)}${consent}`, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: kb || contact || { remove_keyboard: true } });
}

async function answer(env, chat, from, text) {
  const key = `s:${chat}`;
  const st = JSON.parse((await env.STATE.get(key)) || "null");
  if (!st) return false;
  st.answers.push(text);
  st.step += 1;
  if (st.step < CONFIG.brief.length) {
    await env.STATE.put(key, JSON.stringify(st), { expirationTtl: 7200 });
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


// ---------- «мозги»: ChatGPT через kie.ai отвечает на свободные вопросы как опытный продавец ----------
// Контакты в нейросеть не уходят: телефоны, почты, ники и ссылки вырезаются. Память разговора – 6 реплик, 30 минут.
const AI_URL = "https://api.kie.ai/gpt-5-2/v1/chat/completions";
const AI_LIMIT = 20; // ответов нейросети одному клиенту в сутки
const mask = (t) => String(t)
  .replace(/https?:\/\/\S+|t\.me\/\S+/gi, "[ссылка]")
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[почта]")
  .replace(/@\w{4,}/g, "[ник]")
  .replace(/\+?\d[\d\s()‐-]{8,}\d/g, "[телефон]");
function sellerPrompt() {
  const first = (CONFIG.name || "").split(" ")[0] || "мастер";
  const services = (CONFIG.services || []).map((s) => `${s.title} – ${s.price || "цена по запросу"}: ${s.desc || ""}`).join("; ");
  const steps = (CONFIG.steps || []).map(([t, p]) => `${t} – ${p}`).join("; ");
  const works = (CONFIG.cases || []).slice(0, 8).map((c) => `${c.title} (${[c.niche, c.city].filter(Boolean).join(", ")})${c.kind === "real" && c.result ? ": " + c.result : ""}`).join("; ");
  return `Ты – бот-помощник ${CONFIG.name || "веб-мастера"}: он делает сайты для малого бизнеса. Ты пишешь в Telegram владельцу бизнеса, который пришёл сам. Ты опытный и успешный продавец: дружелюбный, уверенный, без давления и без канцелярита.
Как ты продаёшь:
– отвечай коротко: 2–4 предложения, обычным текстом, без списков, без звёздочек и markdown;
– сначала по делу ответь на вопрос, потом задай один уточняющий вопрос о его бизнесе или задаче;
– говори о выгоде для его бизнеса: сайт приводит клиентов, цены и запись видны сразу, отзывы с Карт вызывают доверие;
– главный козырь: ${first} делает бесплатное демо сайта до оплаты – клиент видит результат, а потом решает;
– когда задача понятна или клиент спрашивает про цену и сроки – предложи нажать кнопку «Оставить заявку» под сообщением: ${first} посмотрит и ответит лично.
Факты – бери только отсюда: услуги и цены: ${services || "цены уточняются в заявке"}. Как работаем: ${steps}. Работы: ${works || "есть примеры в меню «Посмотреть работы»"}.
Правила: не называй цен, сроков, скидок и гарантий, которых нет в фактах – скажи, что ${first} уточнит после заявки. Не обещай результатов в цифрах. Не проси телефон в переписке – для этого кнопка «Оставить заявку». На вопросы не про сайты и не про бизнес клиента отвечай одной вежливой фразой и возвращай к теме. Если спросят, кто ты, – честно скажи, что бот-помощник ${first}. Пиши по-русски, тире – короткое «–».`;
}
async function aiAnswer(env, chat, from, text) {
  if (!CONFIG.ai || !env.KIE_KEY) return false;
  const day = new Date().toISOString().slice(0, 10), lk = `ai:${chat}:${day}`;
  const used = Number((await env.STATE.get(lk)) || 0);
  if (used >= AI_LIMIT) return false;
  await env.STATE.put(lk, String(used + 1), { expirationTtl: 86400 });
  const mk = `m:${chat}`;
  const hist = JSON.parse((await env.STATE.get(mk)) || "[]");
  hist.push({ role: "user", content: mask(text).slice(0, 800) });
  await api(env, "sendChatAction", { chat_id: chat, action: "typing" });
  let reply = "";
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 25000);
    const r = await fetch(AI_URL, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", authorization: `Bearer ${env.KIE_KEY}` },
      body: JSON.stringify({ messages: [{ role: "system", content: sellerPrompt() }, ...hist.slice(-6)], stream: false }) });
    clearTimeout(tm);
    const j = await r.json();
    reply = String(j?.choices?.[0]?.message?.content || "").replace(/\*\*?|__|#+\s/g, "").replace(/—/g, "–").trim();
  } catch { reply = ""; }
  if (!reply) return false;
  hist.push({ role: "assistant", content: reply });
  await env.STATE.put(mk, JSON.stringify(hist.slice(-6)), { expirationTtl: 1800 });
  await api(env, "sendMessage", { chat_id: chat, text: reply.slice(0, 3500), reply_markup: back });
  const who = from.username ? `@${from.username}` : esc([from.first_name, from.last_name].filter(Boolean).join(" "));
  await api(env, "sendMessage", { chat_id: CONFIG.ownerChatId, parse_mode: "HTML",
    text: `💬 <b>Вопрос в боте</b> от ${who}\n${esc(text).slice(0, 1500)}\n\n<b>Ответ бота:</b>\n${esc(reply).slice(0, 1500)}`,
    reply_markup: { inline_keyboard: [[{ text: "Написать клиенту", url: from.username ? `https://t.me/${from.username}` : `tg://user?id=${from.id}` }]] } });
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
      await env.STATE.put(`s:${chat}`, JSON.stringify({ step: 0, answers: [] }), { expirationTtl: 7200 });
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
  if (String(chat) !== String(CONFIG.ownerChatId) && m.text && await aiAnswer(env, chat, m.from, m.text)) return;
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
