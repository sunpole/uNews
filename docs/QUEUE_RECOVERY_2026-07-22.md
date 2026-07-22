# Восстановление очереди uNews — 2026-07-22

## Итог

Очередь uNews полностью восстановлена и подтверждена реальной публикацией.

Финальное состояние:

```text
uNews version: 0.3.7
last_attempt_status: success
pending_count: 0
ready_project_count: 0
error_count: 0
last_error: null
data/errors.json: []
service issue #3: closed
```

Реальный пакет опубликовал десять ожидавших записей в строгом FIFO-порядке с паузой не менее 61 секунды. После каждого ответа Telegram был создан отдельный GitHub checkpoint.

## Что было сломано

Восстановление потребовало закрыть три независимых дефекта.

### 1. Ошибка терялась до сохранения state

При фатальном сбое publisher-step завершал job раньше, чем workflow успевал зафиксировать `data/health.json` и `data/errors.json`.

Исправлено в `0.3.5`:

- добавлен защитный runner;
- безопасная причина ошибки записывается до финального `exit 1`;
- state коммитится до завершения workflow с ошибкой;
- secrets редактируются;
- служебный Issue создаётся один раз и закрывается после восстановления.

### 2. Первый per-post checkpoint не имел Git identity

Telegram уже принял `uDream 23.8.0`, но внутренний `git commit` не смог выполниться, потому что identity `github-actions[bot]` настраивалась только позднее.

Исправлено в `0.3.6`:

- Git name/email настраиваются до `npm run publish:all`;
- source-check контролирует порядок шагов;
- `UNEWS_GIT_CHECKPOINT=1` остаётся обязательным;
- fallback state commit сохранён как дополнительная защита.

Опубликованный до исправления пост был восстановлен без дубля:

```text
uDream 23.8.0
message_id: 54
post_url: https://t.me/uNewsLog/54
published_at: 2026-07-22T09:59:22.164Z
```

### 3. Проверялось наличие URL, а не изображение

Старая функция делала HTTP `HEAD`. Повреждённый файл:

- существовал;
- имел расширение `.png`;
- начинался с правильной PNG-сигнатуры;
- имел размер `600×315`;
- содержал неверный CRC chunk `PLTE`;
- не декодировался `pngcheck`, ImageMagick и Telegram.

Telegram возвращал `IMAGE_PROCESS_FAILED`.

Исправлено в `0.3.7`:

- каждый pending-файл скачивается через GET;
- расширение сверяется с реальным PNG/JPEG/GIF/WebP форматом;
- PNG проходит CRC-проверку каждого chunk;
- проверяются `IHDR`, `PLTE`, `IDAT`, `IEND` и trailing bytes;
- IDAT обязательно проходит zlib-декодирование;
- выбранное изображение скачивается и проверяется повторно непосредственно перед Telegram;
- Telegram получает проверенные bytes как multipart Blob, а не raw URL;
- архитектура защищена source-check и regression fixtures.

Полный технический контракт находится в [IMAGE_INTEGRITY.md](IMAGE_INTEGRITY.md).

## Ремонт источника uDream

В uDream PR #24 были исправлены пять ещё не опубликованных записей `23.8.1–23.8.5`.

- `23.8.1` и `23.8.2` больше не используют повреждённый общий PNG;
- `23.8.3–23.8.5` больше не используют старую нерелевантную картинку;
- созданы пять отдельных реальных Playwright Chromium-снимков исторических GitHub-страниц;
- сохранены исходные `project`, `series`, `version` и `queued_at`;
- FIFO-позиции не изменены;
- runtime, PWA и активная база uDream не менялись.

uDream repair merge commit:

```text
acc91a1162521a35fcdd3d3cfbc11811f2988508
```

## Проверка до публикации

После merge uNews `0.3.7` actual-main dry-run подтвердил:

```text
projects scanned: 35
new patchnotes: 10
ready in batch: 10
reported errors: 0
would publish: 10
```

Порядок:

1. uDream 23.8.1
2. uDream 23.8.2
3. uDream 23.8.3
4. uDream 23.8.4
5. uDream 23.8.5
6. uDream 23.8.6
7. uDream 23.8.7
8. uNews 0.3.5
9. uNews 0.3.6
10. uNews 0.3.7

Ранее опубликованный message `54` отсутствовал среди pending-записей.

## Реальный запуск

Штатный push-trigger:

```text
.github/unews-run
```

Trigger commit:

```text
763650e47aada175bd23332c1a9f05d454437e63
```

Per-post checkpoints:

| Порядок | Запись | Message | Telegram | Git checkpoint |
|---:|---|---:|---|---|
| 1 | uDream 23.8.1 | 55 | https://t.me/uNewsLog/55 | `e26a653` |
| 2 | uDream 23.8.2 | 56 | https://t.me/uNewsLog/56 | `477d9d6` |
| 3 | uDream 23.8.3 | 57 | https://t.me/uNewsLog/57 | `888aa4b` |
| 4 | uDream 23.8.4 | 58 | https://t.me/uNewsLog/58 | `3dc3c06` |
| 5 | uDream 23.8.5 | 59 | https://t.me/uNewsLog/59 | `b759734` |
| 6 | uDream 23.8.6 | 60 | https://t.me/uNewsLog/60 | `74dbfb5` |
| 7 | uDream 23.8.7 | 61 | https://t.me/uNewsLog/61 | `07dc2bd` |
| 8 | uNews 0.3.5 | 62 | https://t.me/uNewsLog/62 | `0fd2f92` |
| 9 | uNews 0.3.6 | 63 | https://t.me/uNewsLog/63 | `429c4cc` |
| 10 | uNews 0.3.7 | 64 | https://t.me/uNewsLog/64 | `c74a610` |

Финальный state commit:

```text
064cbde39ca3c46cf746bcce65027eef517f45ef
```

## Финальная проверка состояния

`data/health.json`:

```json
{
  "last_attempt_status": "success",
  "pending_count": 0,
  "ready_project_count": 0,
  "error_count": 0,
  "selected_key": null,
  "mode": "publish",
  "last_error": null
}
```

`data/errors.json`:

```json
{
  "errors": []
}
```

Служебный Issue:

```text
https://github.com/sunpole/uNews/issues/3
state: closed
state_reason: completed
closed_at: 2026-07-22T11:45:31Z
```

## Действующий рабочий процесс

1. Проект-источник добавляет патчноут и новое реальное изображение в `news/`.
2. Проектный CI проверяет патчноут и evidence.
3. uNews скачивает все pending-изображения через GET и глубоко проверяет bytes.
4. FIFO выбирает только готовые головы проектов.
5. Перед каждым Telegram-постом изображение скачивается и проверяется повторно.
6. Telegram получает проверенный Blob.
7. После ответа Telegram `message_id` и `post_url` атомарно записываются в `data/published.json`.
8. Создаётся отдельный Git checkpoint.
9. Между постами выдерживается не менее 61 секунды.
10. После пакета обновляются health/errors и закрывается служебный Issue, если ошибок нет.

## Правила дальнейшей поддержки

- не возвращать `HEAD` как единственную проверку изображения;
- не доверять только расширению или первым восьми байтам PNG;
- не передавать Telegram непроверенный raw URL;
- не отключать CRC/zlib проверки ради прохождения конкретного файла;
- не публиковать более новую версию поверх заблокированной ранней версии проекта;
- не создавать дубль уже опубликованного сообщения;
- для опубликованного поста использовать `edit:media` или `edit:caption` по сохранённому `message_id`;
- не хранить временные diagnostic workflow в `main`;
- не выводить secrets в state, log, issue или патчноут.

## Точки восстановления

- `0.3.5` — recovery-state baseline;
- `0.3.6` — checkpoint Git identity baseline;
- `0.3.7` — image-integrity baseline;
- `stable/manual-publishing-v0.1.0` — стабильное ручное состояние до автоматизации;
- `release/v0.1.0-stable-manual` — дополнительная ручная точка восстановления.
