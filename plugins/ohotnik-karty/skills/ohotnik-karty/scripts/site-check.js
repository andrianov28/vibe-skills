// Охотник: оценка чужого сайта. Запускать на открытом сайте бизнеса после загрузки (3 с).
// Возвращает признаки: жив ли, адаптив, год в подвале, конструктор-заглушка. Вердикт ставит Клод.
(() => {
  const html = document.documentElement.outerHTML;
  const text = document.body ? document.body.innerText : '';
  const years = [...text.matchAll(/(?:©|\(c\)|20\d\d)[^\n]{0,40}?(20\d\d)/g)].map(m => +m[1]);
  const builderM = (html + location.href).match(/clients\.site|taplink|tilda|wix|ucoz|nethouse|umi\.ru|vigbo|wordpress/i);
  return {
    url: location.href,
    title: document.title,
    textLength: text.length,
    hasViewport: !!document.querySelector('meta[name=viewport]'),
    tablesLayout: document.querySelectorAll('table').length > 3,
    flash: /\.swf|shockwave/i.test(html),
    yearInFooter: years.length ? Math.max(...years) : null,
    builder: builderM ? builderM[0] : null,
    errorLike: /404|не найдена|not found|припаркован|parked|срок регистрации|истек/i.test(text.slice(0, 600)) || text.length < 80,
    hasPhone: /\+7[\s\d()-]{10,17}/.test(text),
    hasForm: !!document.querySelector('form input, form textarea')
  };
})()
