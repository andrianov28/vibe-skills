# vibe-skills

Каталог скиллов курса «Вайб-сайты» (Академия Интернет Маркетинга) для Claude Code.

## Установка

### В приложении Claude (вкладка Code) – одной фразой

Скопируй и отправь Клоду:

```
Подключи каталог скиллов курса «Вайб-сайты»: добавь в мой файл настроек ~/.claude/settings.json marketplace vibe-skills (github, repo andrianov28/vibe-skills) в extraKnownMarketplaces и включи плагин kwork-podborka@vibe-skills в enabledPlugins. Потом скажи, что сделал.
```

После ответа Клода перезапусти приложение (или начни новый чат). Проверка: напиши «подбери заказы».

### В терминале Claude Code – двумя командами

```
/plugin marketplace add andrianov28/vibe-skills
/plugin install kwork-podborka@vibe-skills
```

### Что именно попадает в настройки

Файл `~/.claude/settings.json` (Windows: `C:\Users\<имя>\.claude\settings.json`), два ключа:

```json
{
  "extraKnownMarketplaces": {
    "vibe-skills": {
      "source": { "source": "github", "repo": "andrianov28/vibe-skills" }
    }
  },
  "enabledPlugins": {
    "kwork-podborka@vibe-skills": true
  }
}
```

Если в файле уже есть эти ключи, записи добавляются к существующим, ничего не удаляется. Следующие скиллы курса включаются строкой в `enabledPlugins`, например `"razbor-tz@vibe-skills": true`. Фраза Клоду для второго и следующих скиллов короче, каталог уже подключён:

```
Включи скилл razbor-tz из каталога vibe-skills: добавь в мой файл настроек ~/.claude/settings.json в enabledPlugins строку razbor-tz@vibe-skills: true. Потом скажи, что сделал.
```

### Обновление

Плагины из каталога обновляются автоматически при старте Claude Code. В терминале можно принудительно: `/plugin update kwork-podborka@vibe-skills`.

## Скиллы

| Скилл | Что делает | Урок |
|---|---|---|
| `kwork-podborka` | Сам читает биржу Kwork, отбирает свежие простые сайты, пишет черновики откликов | Д1.6 |
| `razbor-tz` | Разбирает ТЗ заказчика в бриф со слотами, с которого стартует сборка сайта | Д2.1 |

Скиллы добавляются по мере выхода уроков.

## Автор

Евгений Андрианов, [Академия Интернет Маркетинга](https://academymarketing.ru)
