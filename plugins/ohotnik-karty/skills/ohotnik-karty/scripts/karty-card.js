// Охотник: чтение карточки организации на Яндекс.Картах.
// Запускать через javascript_tool на странице /maps/org/<slug>/<id>/ после загрузки (3 с).
// Возвращает JSON с фактами карточки. Ничего не выдумывает: чего нет на странице – null.
(async () => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const txt = (el) => (el ? el.innerText.trim() : null);
  const body = document.body.innerText;

  // Раскрыть график работы (клик по «График»), если есть
  const grafik = $$('div, span, button').find(e => e.children.length === 0 && /^График$/.test(e.innerText.trim()));
  if (grafik) { grafik.click(); await new Promise(r => setTimeout(r, 700)); }

  const name = txt($('h1')) || txt($('.card-title-view__title'));
  const rating = txt($('.business-summary-rating-badge-view__rating-text, .business-rating-badge-view__rating-text'));
  const countM = body.match(/(?:^|\n)(\d[\d ]*) оцен(?:ок|ки|ка)/);
  const ratingCount = countM ? parseInt(countM[1].replace(/\s/g, ''), 10) : null;
  const phone = txt($('[itemprop=telephone]')) || (body.match(/\+7[\s\d()-]{10,17}/) || [null])[0];
  const address = $('meta[itemprop=address]')?.content || txt($('.business-contacts-view__address-link'));
  const crumbs = txt($('.breadcrumbs-view, .orgpage-header-view__breadcrumbs')) || (body.match(/Карты · ([^\n]+)/) || [null, null])[1];
  const rubric = crumbs ? crumbs.split('·').pop().trim() : null;
  const siteEl = $('.business-urls-view a');
  const site = siteEl ? siteEl.href : null;
  const socials = $$('a[aria-label^="Соцсети"]').map(a => ({
    kind: (a.getAttribute('aria-label').split(',')[1] || '').trim(),
    url: a.href.replace(/\?text=.*$/, '')
  }));
  const bookBtn = $$('a, button, div[role=button]').find(e => /^Записаться онлайн$/.test(e.innerText.trim()));
  const booking = bookBtn ? (bookBtn.href || 'кнопка на карточке') : null;
  const tabs = {};
  $$('.tabs-select-view__title').forEach(t => {
    const m = t.innerText.trim().match(/^(\D+?)\s*(\d+)?$/);
    if (m) tabs[m[1].trim()] = m[2] ? parseInt(m[2], 10) : true;
  });
  // Заголовки разделов ищем с конца: первое вхождение «Товары и услуги» / «Особенности» – это вкладки, а не раздел
  const between = (a, b) => { const i = body.lastIndexOf(a); if (i < 0) return null; const j = body.indexOf(b, i + a.length); return body.slice(i + a.length, j < 0 ? i + 1500 : j).trim(); };
  const pricesBlock = between('Товары и услуги\n', 'Посмотреть все товары и услуги');
  let pricesFresh = null, prices = [];
  if (pricesBlock && !/^Фото\n/.test(pricesBlock)) {
    const fm = pricesBlock.match(/^(Обновлено [^\n]+|Давно не обновлялось)/);
    pricesFresh = fm ? fm[1] : null;
    const lines = pricesBlock.split('\n').map(s => s.trim()).filter(Boolean).filter(s => !fm || s !== fm[1]);
    for (let i = 1; i < lines.length; i++) {
      if (!/₽$/.test(lines[i])) continue;
      let nm = lines[i - 1];
      // строка перед ценой может быть описанием (кончается точкой или начинается с «Включает…») – тогда название на строку выше
      if (i > 1 && !/₽$/.test(lines[i - 2]) && (/\.$/.test(nm) || /^(Включает|В стоимость|Входит|Подходит|Процедура|Длительность|Время)/i.test(nm) || (nm.length > 70 && lines[i - 2].length < 60))) nm = lines[i - 2];
      prices.push({ name: nm, price: lines[i] });
    }
  }
  const featuresRaw = between('Особенности\n', 'Подробнее об организации');
  const features = featuresRaw ? featuresRaw.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 25) : null;
  const hoursEl = $('.business-working-intervals-view');
  const hours = hoursEl ? txt(hoursEl).replace(/\n+/g, '; ') : (body.match(/(Круглосуточно|ежедневно[^\n]*|Закрыто до [^\n]*|До \d\d:\d\d)/) || [null])[0];
  const status = (body.match(/(Закрыто до [^\n]+|Открыто[^\n]*|До закрытия [^\n]+|До \d\d:\d\d|Круглосуточно)/) || [null])[0];
  const reviewsCount = tabs['Отзывы'] === true ? null : (tabs['Отзывы'] ?? null);
  const photosCount = tabs['Фото'] === true ? null : (tabs['Фото'] ?? null);
  const promo = (body.match(/Акция:\n([^\n]+)/) || [null, null])[1];
  const aspects = [...body.matchAll(/([А-Яа-яё ]+?) ·\n(\d+)%\nположительный\n(\d+) отзыв/g)].map(m => ({ what: m[1].trim(), positive: +m[2], n: +m[3] }));
  return {
    url: location.href.split('?')[0], name, rubric, rating, ratingCount, reviewsCount, photosCount,
    phone, address, site, socials, booking, hours, status, prices, pricesFresh, features, promo, aspects,
    capturedAt: new Date().toISOString().slice(0, 10)
  };
})()
