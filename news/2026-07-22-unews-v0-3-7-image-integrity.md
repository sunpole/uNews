---
type: bugfix
project: uNews
series: unews
title: Повреждённые изображения блокируются до Telegram
version: 0.3.7
queued_at: 2026-07-22T11:26:00Z
repo_url: https://github.com/sunpole/uNews
web_url: https://sunpole.github.io/uNews/
image: 2026-07-22-unews-v0-3-7-image-integrity.png
image_source: document-render
image_target: assets/covers/unews-v0.3.7-image-integrity.svg
image_commit: 4f3f5ee371af205fbccdaa6726c865d6a34e866f
image_captured_at: 2026-07-22T11:25:54Z
---

# uNews 0.3.7: проверка реальных bytes до Telegram

uNews больше не считает изображение готовым только потому, что файл существует по URL и имеет знакомое расширение.

Корень ошибки:

- прежняя проверка использовала HTTP `HEAD`;
- повреждённый `.png` был доступен и проходил проверку наличия;
- PNG имел неверный CRC chunk `PLTE`;
- Telegram возвращал `IMAGE_PROCESS_FAILED`;
- `pngcheck` и ImageMagick также не могли корректно декодировать файл.

Что исправлено:

- каждый pending-файл скачивается через GET;
- расширение сверяется с реальным PNG/JPEG/GIF/WebP форматом;
- проверяются размер файла, размеры изображения и пропорции;
- PNG проходит проверку всех chunk CRC;
- проверяются `IHDR`, `PLTE`, `IDAT`, `IEND` и отсутствие trailing bytes;
- объединённый IDAT обязательно проходит zlib-декодирование;
- полный аудит проверяет все pending-записи до FIFO selection;
- выбранный файл скачивается и проверяется повторно непосредственно перед постом;
- Telegram получает уже проверенные bytes как multipart Blob вместо raw URL;
- локальная проверка одного патчноута использует тот же модуль.

Добавлены регрессионные fixtures:

- корректный indexed PNG;
- неверный CRC `PLTE`;
- повреждённый zlib-stream с корректным CRC;
- несовпадение расширения и bytes;
- trailing bytes после `IEND`;
- HTTP failure и лимит размера;
- обязательное использование GET.

Проверенный GitHub Actions dry-run после объединения uDream PR #24:

```text
projects scanned: 35
new patchnotes: 9
ready in batch: 9
reported errors: 0
would publish: 9
```

Очередь начинается с `uDream 23.8.1`. Уже опубликованный `uDream 23.8.0` сохранён как Telegram message `54` и среди pending-записей отсутствует, поэтому дубль не создаётся.

Не изменены:

- строгий FIFO;
- порядок версий внутри проекта;
- максимум 20 постов;
- пауза не менее 61 секунды;
- per-post GitHub checkpoint;
- recovery-state и secret redaction;
- запрет реальной локальной отправки.

Документация синхронизирована:

- `README.md` — рабочий сценарий;
- `docs/QUEUE_ARCHITECTURE.md` — жизненный цикл очереди;
- `docs/IMAGE_INTEGRITY.md` — полный технический контракт;
- `VERSION.md` — версия, доказательства и точки восстановления.

Короткий текст для Telegram:

Исправление uNews 0.3.7 блокирует повреждённые изображения до Telegram: каждый pending-файл скачивается через GET, проходит проверку формата, PNG CRC и zlib-декодирование, а перед постом проверяется повторно и отправляется как готовый Blob. Полный dry-run проверил 35 проектов: 9 ready, 0 errors; uDream message 54 не повторяется, FIFO и пауза 61 секунда сохранены.
