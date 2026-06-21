# uNews

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-uNews-blue)](https://sunpole.github.io/uNews/)
[![Telegram](https://img.shields.io/badge/Telegram-@uNewsLog-26A5E4)](https://t.me/uNewsLog)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**uNews** — единая система публикации новостей, патчноутов и отчётов разработки по проектам Антона.

Главная идея: каждый проект хранит свои новости в папке `news/`, а uNews забирает эти патчноуты и публикует их в Telegram-канал через бота.

## Что уже умеет

- публиковать текстовые сообщения в Telegram;
- публиковать пост с одной картинкой;
- публиковать альбом из нескольких картинок через `sendMediaGroup`;
- брать порядок картинок из YAML-поля `images`;
- использовать `image` как запасной вариант для одной картинки;
- проверять публикацию без отправки в Telegram;
- ограничивать подпись под Telegram-альбомом без изменения исходного `.md`.

## Основные проекты

- `500 Tower Defense`
- `uSugar`
- `uDream`
- `uChurch`
- `GOART`
- `Time Rift`
- другие проекты автора

## Как работает система

1. В репозитории проекта создаётся папка `news/`.
2. В неё добавляется Markdown-файл патчноута.
3. Рядом кладётся изображение или несколько изображений.
4. uNews читает YAML и текст патчноута.
5. Скрипт отправляет публикацию в Telegram-канал.

## Пример структуры патчноута

```text
news/
├── 2026-06-14-500td-v1-0-2-pages-preview.md
├── 2026-06-14-500td-v1-0-2-pages-preview.png
└── 2026-06-14-500td-v1-0-2-pages-preview_2.png
```

## Пример YAML

```yaml
type: patch
project: 500 Tower Defense
series: 500td
title: Версия 1.0.2 подготовлена для веб-запуска
version: 1.0.2
repo_url: https://github.com/sunpole/500
web_url: https://sunpole.github.io/500/previews/500td/1.0.2/
image: 2026-06-14-500td-v1-0-2-pages-preview.png
images:
  - 2026-06-14-500td-v1-0-2-pages-preview_2.png
  - 2026-06-14-500td-v1-0-2-pages-preview.png
```

### Поля

- `type` — тип публикации: `intro`, `patch`, `report`, `note`.
- `project` — название проекта.
- `series` — короткий ключ серии, например `500td`, `usugar`, `udream`.
- `title` — заголовок публикации.
- `version` — версия, если она есть.
- `repo_url` — ссылка на GitHub-репозиторий.
- `web_url` — ссылка на рабочую веб-версию или preview.
- `image` — одна картинка или fallback.
- `images` — список картинок для Telegram-альбома.

Если указано `images`, порядок картинок берётся строго из YAML. Первая картинка получает подпись, остальные отправляются без подписи.

## Короткий текст для Telegram

Внутри патчноута можно добавить блок:

```text
Короткий текст для Telegram:
```

Текст после этого блока будет использован как короткая подпись к Telegram-публикации. Это удобно, если полный патчноут длинный.

## Локальная проверка

Проверка без отправки:

```bash
npm run publish:projects:check -- "../500_td_game/news/2026-06-14-500td-v1-0-2-pages-preview.md"
```

Ожидаемый результат для альбома:

```json
{
  "method": "sendMediaGroup",
  "captionWasTruncated": false
}
```

## Реальная публикация

Отправка в Telegram:

```bash
npm run publish:projects -- "../500_td_game/news/2026-06-14-500td-v1-0-2-pages-preview.md"
```

Локальные секреты должны храниться только в `.env`. Этот файл нельзя добавлять в GitHub.

## Credentials diagnostics / Unauthorized

Перед реальной публикацией можно безопасно проверить Telegram-настройки:

```bash
npm run diagnose:telegram
```

Диагностика показывает только наличие переменных, результат `getMe`, целевой канал и результат `getChat`. Она не печатает токен целиком или частично.

Ожидаемые локальные переменные:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHANNEL_ID=@uNewsLog
BOT_USERNAME=@uNewsDev_bot
```

Если публикация падает с `Telegram sendPhoto failed: Unauthorized` или диагностика показывает `bot getMe: FAILED (401)`, проблема в `TELEGRAM_BOT_TOKEN`: токен отсутствует, отозван, введён неверно или не относится к нужному Telegram-боту. В этом случае нужно заменить `TELEGRAM_BOT_TOKEN` в локальном `.env` на актуальный токен `@uNewsDev_bot`.

Если локально публикация работает, а GitHub Actions падает, проверьте repository secrets для `sunpole/uNews`:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHANNEL_ID`

Значения секретов нельзя публиковать в README, логах, issue, pull request или патчноутах.

## Telegram

- Канал: [@uNewsLog](https://t.me/uNewsLog)
- Бот: `@uNewsDev_bot`

## GitHub Actions

Текущий workflow `Collect project news` пока умеет вручную проверить структуру проекта и наличие папки `news/`.

Следующий этап — сделать центральный publisher для всех репозиториев автора:

- список проектов в `projects.json`;
- список уже опубликованных патчноутов в `data/published.json`;
- автоматический запуск по расписанию;
- защита от повторной публикации одного и того же патчноута.

## Статус

Проект находится на этапе первичной настройки.

Уже проверено на практике:

- бот публикует текст в Telegram;
- бот публикует Telegram-альбом;
- патчноут `500TD v1.0.2` опубликован с двумя изображениями;
- локальная проверка `publish:projects:check` работает.

## Лицензия

MIT
