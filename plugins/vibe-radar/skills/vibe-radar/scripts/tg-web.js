// Радар заказов: помощник для Telegram Web (web.telegram.org/k/, ученик вошёл в свой аккаунт).
// Клод вставляет ЭТОТ ФАЙЛ ЦЕЛИКОМ в javascript_tool встроенного браузера, затем вызывает функции.
// Только чтение: ни во что не вступает, ничего не пишет, Stars не тратит.
//   await vibeRadar.najti(['нужен лендинг', …], ['заказы сайты', …])   – кандидаты: глобальный поиск по постам (только бесплатные) + поиск чатов
//   await vibeRadar.pohozhie(['program_job', …])                          – «похожие каналы»
//   await vibeRadar.prochitat(['program_job', …], 60)                     – последние посты каналов/групп → JSON для radar.mjs
(() => {
  const m = window.rootScope && window.rootScope.managers;
  if (!m) throw new Error('Telegram Web не готов: откройте web.telegram.org/k/ и войдите в аккаунт');
  // если Telegram притормаживает ответ (FLOOD_WAIT), не висим дольше 25 секунд – канал пропускаем
  const api = (method, p) => Promise.race([m.apiManager.invokeApi(method, p), new Promise((_, rej) => setTimeout(() => rej(new Error('Telegram не ответил за 25 с – пропущено')), 25000))]);
  const uname = (c) => c.username || (c.usernames && c.usernames[0] && c.usernames[0].username) || '';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pick = (chats, src, into) => {
    for (const c of chats || []) {
      const u = uname(c); if (!u || c._ !== 'channel') continue;
      if (!into.has(u)) into.set(u, { c: u, title: c.title, members: c.participants_count || null, group: !!(c.pFlags && c.pFlags.megagroup), src });
    }
  };
  async function freeLeft(q) {
    // query_is_free – этот запрос уже искали сегодня (повтор бесплатно); remains – сколько бесплатных новых поисков осталось
    try { const f = await api('channels.checkSearchPostsFlood', { query: q }); return f && f.pFlags && f.pFlags.query_is_free ? 1 : (f.remains || 0); }
    catch (e) { return 0; }
  }
  window.vibeRadar = {
    async najti(posts = [], chats = []) {
      const found = new Map(); const log = [];
      for (const q of posts) {
        const left = await freeLeft(q);
        if (left <= 0) { log.push(`поиск по постам «${q}»: бесплатные на сегодня кончились – пропускаю (Stars не тратим)`); continue; }
        try { const r = await api('channels.searchPosts', { query: q, offset_rate: 0, offset_peer: { _: 'inputPeerEmpty' }, offset_id: 0, limit: 50 }); pick(r.chats, 'посты: ' + q, found); log.push(`посты «${q}»: ${(r.messages || []).length} постов, осталось бесплатных ${left - 1}`); }
        catch (e) { log.push(`посты «${q}»: ошибка ${e.type || e.message}`); }
        await sleep(800);
      }
      for (const q of chats) {
        try { const r = await api('contacts.search', { q, limit: 30 }); pick(r.chats, 'чаты: ' + q, found); log.push(`чаты «${q}»: ${(r.chats || []).length}`); }
        catch (e) { log.push(`чаты «${q}»: ошибка ${e.type || e.message}`); }
        await sleep(500);
      }
      return { log, kandidaty: [...found.values()] };
    },
    async pohozhie(list = []) {
      const found = new Map();
      for (const u of list) {
        try { const r = await api('contacts.resolveUsername', { username: u }); const ch = r.chats[0]; const rec = await m.appChatsManager.getChannelRecommendations(ch.id); pick(rec.chats, 'похожие на @' + u, found); }
        catch (e) { /* канал не найден – пропускаем */ }
        await sleep(500);
      }
      return [...found.values()];
    },
    async prochitat(list = [], limit = 60) {
      const out = [];
      for (const u of list) {
        try {
          const r = await api('contacts.resolveUsername', { username: u }); const ch = r.chats[0];
          const peer = { _: 'inputPeerChannel', channel_id: ch.id, access_hash: ch.access_hash };
          const h = await api('messages.getHistory', { peer, limit, offset_id: 0, offset_date: 0, add_offset: 0, max_id: 0, min_id: 0, hash: 0 });
          const users = Object.fromEntries((h.users || []).map((x) => [x.id, x.username ? '@' + x.username : [x.first_name, x.last_name].filter(Boolean).join(' ')]));
          const all = (h.messages || []).filter((x) => x.message).map((x) => ({ id: x.id, d: new Date(x.date * 1000).toISOString(), t: x.message, author: users[x.from_id && x.from_id.user_id] || '' })).reverse();
          // чтобы ответ был компактным: счётчики по всем постам + только посты про сайты (до 1200 знаков)
          const MIRROR = /(https?:\/\/\S+\/(project\/\S+\/)?\d{6,8}\b|intwork\.top|kwork\.ru|fl\.ru|freelancehunt|желаемый бюджет|допустимый:|№\s?\d{6,}|категория:)/i;
          const SITE = /(сайт|лендинг|landing|одностранич|тильд|tilda|визитк|посадочн)/i;
          const ASK = /(ищу|ищем|нуж(ен|на|но|ны)|надо|требуется|кто (может|сможет|сделает|возьм)|есть (ли )?(кто|ребята|люди|специалист)|подскажите|посоветуйте|заказ|хочу)/i;
          const cand = all.filter((p) => SITE.test(p.t.slice(0, 600)) && ASK.test(p.t.slice(0, 250)) && p.t.length < 1200 && !MIRROR.test(p.t));
          out.push({ channel: u, title: ch.title, group: !!(ch.pFlags && ch.pFlags.megagroup), n: all.length, mirror: all.filter((p) => MIRROR.test(p.t)).length, last: all.length ? all[all.length - 1].d : null, posts: cand });
        } catch (e) { out.push({ channel: u, error: e.type || e.message || 'не открылся', posts: [] }); }
        await sleep(400);
      }
      return out;
    },
  };
  return 'vibeRadar готов';
})();
