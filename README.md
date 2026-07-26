# uNews

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-uNews-blue)](https://sunpole.github.io/uNews/)
[![Telegram](https://img.shields.io/badge/Telegram-@uNewsLog-26A5E4)](https://t.me/uNewsLog)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**uNews** — единая система публикации новостей, патчноутов и отчётов разработки по проектам Антона.

Текущая версия: **0.3.9**. Она не принимает служебные Markdown-файлы из `news/` за патчноуты и поддерживает `type: documentation` как документационное обновление. Стабильная версия до автоматизации сохранена в ветке [`stable/manual-publishing-v0.1.0`](https://github.com/sunpole/uNews/tree/stable/manual-publishing-v0.1.0).

Главная идея: каждый проект хранит свои новости в папке `news/`, а uNews забирает эти патчноуты и публикует их в Telegram-канал через бота.

## Что уже умеет

- публиковать текстовые сообщения в Telegram;
- публиковать пост с одной картинкой;
- публиковать альбом из нескольких картинок через `sendMediaGroup`;
- брать порядок картинок из YAML-поля `images`;
- использовать `image` как запасной вариант для одной картинки;
- проверять публикацию без отправки в Telegram;
- ограничивать подпись под Telegram-альбомом без изменения исходного `.md`;
- публиковать до 20 готовых записей за один запуск с паузой не менее 61 секунды;
- фиксировать `data/published.json` сразу после каждого успешного Telegram-поста;
- сохранять безопасную причину фатального сбоя в `data/health.json` и `data/errors.json`;
- коммитить диагностическое состояние до окончательного завершения workflow с ошибкой;
- автоматически закрывать служебный Issue после восстановления очереди;
- скачивать каждое pending-изображение через GET вместо одной проверки HEAD;
- проверять сигнатуру, формат, размеры, PNG CRC и zlib-декодирование;
- повторно проверять файл непосредственно перед Telegram;
- передавать Telegram уже проверенные bytes как multipart Blob.
- автоматически создавать безопасную уменьшенную PNG-копию только для Telegram, сохраняя исходное изображение без изменений;
- игнорировать служебные Markdown-файлы в `news/`, если имя не похоже на датированный патчноут `YYYY-MM-DD-*.md`.

## Основные проекты

- `500 Tower Defense`
- `uSugar`
- `uDream`
- `uChurch`
- `GOART`
- `Time Rift`
- другие проекты автора

## Как работает система

1. В любом публичном репозитории `sunpole` создаётся папка `news/`.
2. В неё добавляются Markdown-патчноут и изображение с полями `version` и `queued_at`.
3. uNews просыпается раз в четыре часа или вручную.
4. Каждый pending-файл скачивается через GET и проходит byte-level image integrity проверку.
5. Внутри проекта более ранняя версия всегда идёт первой.
6. Среди проектов выбирается самая старая запись по `queued_at`.
7. Непосредственно перед Telegram выбранное изображение скачивается и проверяется повторно.
8. Telegram получает проверенный Blob, а не исходный raw URL.
9. За запуск публикуется до 20 готовых Telegram-постов в строгом FIFO-порядке с паузой 61 секунду.
10. Каждый успешный результат немедленно записывается и отправляется в GitHub через `data/published.json`.
11. После завершения запуска обновляются `data/health.json` и `data/errors.json`; при фатальном сбое state коммитится до возврата ошибки.

Приватные репозитории не сканируются. Полная схема: [docs/QUEUE_ARCHITECTURE.md](docs/QUEUE_ARCHITECTURE.md). Точный контракт изображений: [docs/IMAGE_INTEGRITY.md](docs/IMAGE_INTEGRITY.md). Нормализация длинных PNG: [docs/TELEGRAM_PHOTO_NORMALIZATION.md](docs/TELEGRAM_PHOTO_NORMALIZATION.md).

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
queued_at: 2026-07-18T15:40:00Z
repo_url: https://github.com/sunpole/500
web_url: https://sunpole.github.io/500/previews/500td/1.0.2/
image: 2026-06-14-500td-v1-0-2-pages-preview.png
images:
  - 2026-06-14-500td-v1-0-2-pages-preview_2.png
  - 2026-06-14-500td-v1-0-2-pages-preview.png
```

### Поля

- `type` — тип публикации: `intro`, `patch`, `report`, `note`, `docs`, `documentation`, `feature`, `bugfix`, `release`.
- `project` — название проекта.
- `series` — короткий ключ серии, например `500td`, `usugar`, `udream`.
- `title` — заголовок публикации.
- `version` — версия, если она есть.
- `queued_at` — точное UTC-время постановки в очередь в ISO 8601.
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
npm run publish:all:check
npm run diagnose:telegram
npm run check:images
npm test
```

Ожидаемый результат для альбома:

```json
{
  "method": "sendMediaGroup",
  "captionWasTruncated": false
}
```

## GitHub-first publishing

Основной путь реальной публикации — только GitHub Actions. Проект-источник кладёт патчноут и изображение в публичную папку `news/`, после чего workflow `Publish all project news` в uNews находит новый файл, проверяет правила публикации, отправляет пост в `@uNewsLog` и обновляет `data/published.json`.

Локально разрешены только безопасные команды:

```bash
npm run publish:projects:check -- "../500_td_game/news/2026-06-14-500td-v1-0-2-pages-preview.md"
npm run publish:all:check
npm run diagnose:telegram
npm run check:fixtures
npm run check:images
npm test
```

Команды `npm run publish:projects` и `npm run publish:all` по умолчанию блокируют реальную отправку с локального компьютера. Они должны отправлять Telegram-посты только внутри GitHub Actions, где `GITHUB_ACTIONS=true`.

Локальные секреты должны храниться только в `.env`. Этот файл нельзя добавлять в GitHub.

## Required Telegram footer

Финальная подпись Telegram собирается автоматически через policy-слой. Текст из блока `Короткий текст для Telegram` не публикуется “как есть”: к нему добавляются обязательные ссылка и хештеги.

Правило ссылки:

- если есть `web_url`, используется он;
- если `web_url` нет, используется `repo_url`;
- если указан `branch` и нет `web_url`, формируется ссылка на GitHub-ветку;
- если нет ни `web_url`, ни `repo_url`, публикация блокируется.

Обязательные хештеги:

- `uSugar` → `#uSugar #тыСахар #uNews #Sunpole`
- `uNews` → `#uNews #тыНовости #Sunpole`
- `uDream` → `#uDream #тыСон #uNews #Sunpole`
- `uChurch` → `#uChurch #тыЦерковь #uNews #Sunpole`
- `500 Tower Defense` → `#500TD #500ТД #uNews #Sunpole`

Если для проекта нет mapping, check падает и mapping нужно добавить до публикации.

Для `type: patch`, `docs`, `documentation`, `feature`, `bugfix` и `release` финальная подпись обязательно содержит слово “патч”, “обновление”, “релиз” или “документационное обновление”. Если автор забыл это в коротком тексте, policy добавляет компактную вводную фразу автоматически.

Публикация блокируется, если в патчноуте есть подозрение на секреты, `.env`, token-like строки, `TELEGRAM_BOT_TOKEN`, `DEEPSEEK_API_KEY`. Для `uSugar` дополнительно блокируются приватные Telegram identifiers, ngrok-ссылки и явные glucose-like медицинские значения.

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
