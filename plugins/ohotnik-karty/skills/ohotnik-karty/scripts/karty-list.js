// Охотник: чтение списка выдачи Яндекс.Карт (страница поиска «ниша город»).
// Список виртуальный: в DOM видны только карточки рядом с прокруткой. Поэтому вызывать ПОСЛЕ каждой
// прокрутки колёсиком (computer scroll над списком) и накапливать результат в window.__ohota.
(() => {
  window.__ohota = window.__ohota || {};
  document.querySelectorAll('.search-snippet-view').forEach(el => {
    const href = el.querySelector('a[href*="/org/"]')?.getAttribute('href');
    if (!href) return;
    const t = (s) => el.querySelector(s)?.innerText.trim() || null;
    const rc = t('.business-rating-amount-view');
    window.__ohota[href] = {
      href: 'https://yandex.ru' + href.split('?')[0],
      name: t('.search-business-snippet-view__title'),
      rubric: t('.search-business-snippet-view__category'),
      rating: t('.business-rating-badge-view__rating-text'),
      ratingCount: rc ? parseInt(rc.replace(/\s/g, ''), 10) : null,
      address: t('.search-business-snippet-view__address'),
      ad: /Промо$/.test(el.innerText.trim())
    };
  });
  const sc = document.querySelector('.scroll__container');
  const list = Object.values(window.__ohota);
  return { total: list.length, scroll: sc ? sc.scrollTop + '/' + sc.scrollHeight : null, atEnd: sc ? sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 5 : null, list };
})()
