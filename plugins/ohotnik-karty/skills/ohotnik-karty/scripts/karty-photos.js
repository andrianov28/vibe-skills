// Охотник: фото из галереи карточки на Яндекс.Картах.
// Запускать через javascript_tool на странице /maps/org/<slug>/<id>/gallery/ после загрузки (3 с).
// Берёт тот же список, что грузит сама галерея (/maps/api/photos/getByBusinessId): автор, дата, теги, размер.
// Возвращает авторов по числу фото (владелец обычно первый, проверь по ownerHint) и фото с адресом оригинала.
// Видео в список не попадают. Ничего не выдумывает: чего нет – null.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let api = null;
  for (let k = 0; k < 10 && !api; k++) {
    api = performance.getEntriesByType('resource').map(e => e.name).find(n => /\/maps\/api\/photos\/getByBusinessId/.test(n));
    if (!api) await sleep(500);
  }
  let st = null; try { st = JSON.parse(document.querySelector('script.state-view').textContent).stack[0].results.items[0]; } catch (e) {}
  const title = st?.title || document.querySelector('h1')?.innerText.trim() || null;
  const socials = (st?.socialLinks || []).map(s => (s.href || s.url || '').replace(/\?text=.*$/, '')).filter(Boolean);
  const big = u => u.replace(/\/[^/]+$/, '/orig');
  let list = [], source = 'api';
  if (api) {
    const j = await (await fetch(api, { credentials: 'include' })).json();
    list = (j.data || []).filter(p => /get-altay/.test(p.url || '')).map(p => ({
      author: p.copyright?.name || null, authorId: p.copyright?.publicId || null,
      date: (p.copyright?.updateTime || '').slice(0, 10) || null,
      tags: (p.tags || []).map(t => t.name), w: p.width, h: p.height, // w/h – размер XXXL (длинная сторона 1280), не оригинала
      orig: big(p.url), preview: p.url.replace(/\/[^/]+$/, '/L')
    }));
  } else {
    // Запасной путь: сетка галереи виртуальная, картинки есть только у видимых плиток – листаем мелким шагом
    source = 'grid (без авторов и тегов)';
    const sc = document.querySelector('.scroll__container'); const seen = new Set();
    for (let k = 0; k < 200 && sc; k++) {
      document.querySelectorAll('.media-gallery__frame img.media-wrapper__media').forEach(i => { if (/get-altay/.test(i.src)) seen.add(i.src); });
      if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 5) break;
      sc.scrollTop += 400; await sleep(450);
    }
    list = [...seen].map(u => ({ author: null, tags: [], orig: big(u), preview: u.replace(/\/[^/]+$/, '/L') }));
  }
  const by = {};
  list.forEach(p => { const a = p.author || '?'; by[a] = by[a] || { author: a, n: 0, tags: {} }; by[a].n++; p.tags.forEach(t => by[a].tags[t] = (by[a].tags[t] || 0) + 1); });
  const authors = Object.values(by).sort((a, b) => b.n - a.n);
  // Подсказка «кто владелец»: автор с названием компании, иначе самый частый автор, если у него от 20 % фото. Проверь глазами и по контактам карточки.
  const norm = s => (s || '').toLowerCase().replace(/[^a-zа-яё0-9]/g, '');
  const byTitle = authors.find(a => title && norm(a.author) && (norm(a.author).includes(norm(title)) || norm(title).includes(norm(a.author))));
  const top = authors[0];
  const ownerHint = byTitle ? { author: byTitle.author, why: 'имя автора = название компании' }
    : (top && top.author !== '?' && top.n >= Math.max(3, list.length * 0.2) ? { author: top.author, why: `больше всех фото (${top.n} из ${list.length}); сверь с мессенджерами карточки` } : null);
  return {
    title, total: list.length, source, socials, ownerHint,
    authors: authors.slice(0, 8).map(a => `${a.author}: ${a.n} (${Object.entries(a.tags).map(([t, n]) => t + ' ' + n).join(', ')})`),
    owner: ownerHint ? list.filter(p => p.author === ownerHint.author).map(p => ({ date: p.date, tags: p.tags.join(','), w: p.w, h: p.h, orig: p.orig })) : [],
    others: list.filter(p => !ownerHint || p.author !== ownerHint.author).length
  };
})()
