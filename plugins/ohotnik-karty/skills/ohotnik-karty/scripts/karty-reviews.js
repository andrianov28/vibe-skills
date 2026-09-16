// Охотник: отзывы организации. Запускать на странице /maps/org/<slug>/<id>/reviews/ после загрузки (3 с).
// Возвращает до 40 отзывов в порядке страницы (автор, дата, звёзды, текст) – дословно, для поиска крючка.
(async () => {
  const sc = document.querySelector('.scroll__container');
  for (let i = 0; i < 6 && sc; i++) { sc.scrollTop += 1500; await new Promise(r => setTimeout(r, 400)); }
  const items = [...document.querySelectorAll('.business-review-view')].slice(0, 40).map(r => ({
    author: r.querySelector('.business-review-view__author-name, [itemprop=name]')?.innerText.trim() || null,
    date: r.querySelector('.business-review-view__date')?.innerText.trim() || null,
    stars: r.querySelectorAll('.business-rating-badge-view__star._full').length || null,
    text: (r.querySelector('.business-review-view__body-text, .spoiler-view__text-container')?.innerText || '').trim(),
    orgReply: /Посмотреть ответ организации|Ответ организации/.test(r.innerText)
  })).filter(x => x.text);
  const total = (document.body.innerText.match(/(\d+)\s+отзыв/) || [null, null])[1];
  return { total: total ? +total : items.length, loaded: items.length, withReply: items.filter(i => i.orgReply).length, items };
})()
