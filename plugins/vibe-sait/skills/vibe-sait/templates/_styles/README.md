# Стили галереи 2 «Лайт» и 3 «Продающий»

Один движок на все ниши: `scripts/style-build.mjs` берёт контент из `styles.json`, палитры А/Б/В из `templates/<ниша>/template.md`, шрифты из `<head>` каркаса `templates/<ниша>/index.html`. Файлы здесь: `style-lite.css`, `style-prod.css`, `style.js` – копируются в папку сайта при сборке, руками не правятся (правка одной ниши ломает все 30 страниц галереи).

```
node style-build.mjs <ниша> <lite|prod> <папка-сайта> [--content <styles.json>] [--palette А|Б|В] [--assets <папка картинок>] [--gallery]
```

`--gallery` – только для страниц галереи: слоты подсвечены пунктиром, работает переключатель палитр `?p=Б`, лишние картинки из assets удаляются. В сайте заказчика флаг не ставим.

## styles.json – поля

Образцы: `templates/shinomontazh/styles.json` (запись), `templates/okna/styles.json` (калькулятор).

| Поле | Что это |
|---|---|
| `brand`, `niche`, `eyebrow`, `city` | название, ниша, строка над заголовком, город (слот `{{город}}` в галерее) |
| `mode` | `booking` – онлайн-запись; `calc` – калькулятор |
| `h1`, `lead`, `cta`, `facts[3]` | первый экран: заголовок по формуле «что + для кого + УТП», подзаголовок, подпись кнопки, три коротких обещания |
| `h1Scale` | множитель размера h1 (по умолчанию 1, для широких шрифтов вроде Unbounded – 0,8 автоматически) |
| `demoPrices` | `true` – под ценами «Цены для примера» (только галерея); у заказчика – `false` |
| `prices` | `title`, `lead`, `groups[{title, items[{name, note, price, from, unit}]}]`, `note`; `price` – число или слот `"{{цена}}"` |
| `includes` | `title`, `in[]`, `out[]` – «что входит / отдельно» (только Продающий) |
| `steps[{t,d}]`, `stepsTitle` | как проходит работа, 4–5 шагов (настоящая последовательность) |
| `promises[{t,d}]`, `promisesTitle` | гарантии и обещания, 3–4 |
| `faq[{q,a}]` | частые вопросы (только Продающий) |
| `hero {img, alt, caption, pos}` | главное фото; `pos` – точка кадрирования (`"30% 50%"`), если главное сбоку |
| `photos[3] {img, alt, caption, pos}` | три фото под прайсом |
| `contacts {address, hours, phone}`, `messenger {whatsapp, telegram, max}` | whatsapp – номер цифрами (`79001234567`), telegram – ник без @ |
| `reviews[{text,name,date}]`, `rating`, `reviewsCount` | три отзыва дословно с Карт и рейтинг; нет – слоты; `reviews: false` / `rating: false` – блок не показывать |
| `mapsUrl` | ссылка на карточку в Яндекс.Картах – в шапке блока отзывов появится кнопка «Читать все отзывы на Яндекс.Картах» рядом с рейтингом, звёздами и числом отзывов |
| `finalTitle`, `footer` | заголовок последнего блока и подпись в подвале |

### booking (онлайн-запись)
`booking: { title, cta, send, days, closed[дни недели 0–6], slots["10:00"…], services[{name, price, from, min}], message }` – в `message` подстановки `{услуга}`, `{день}`, `{время}`. Если на сегодня окон нет, сразу выбирается следующий день.

### calc (калькулятор)
`calc: { title, cta, send, result, base, min, minNote, per, fields[], message }`
- поля: `range {id, label, short, say, min, max, step, value, unit, price}`, `select {id, label, unit, value, showPrice, options[{label, price}]}`, `check {id, label, price}`;
- итог = `base` + Σ range × price + Σ выбранный вариант × (значение range из `per`, если задан) + Σ галочки (× `per`, если задан); меньше `min` – ставится `min` с пометкой `minNote`;
- `say` – как поле звучит в сообщении (`"стеблей в букете – {v}"`), иначе «метка значение единица»;
- `message` – подстановки `{выбор}` (всё выбранное по порядку полей) и `{итого}`.

Выбор клиента собирается в «Ваше сообщение»: WhatsApp открывается с готовым текстом, в Telegram и MAX текст копируется и открывается чат.
