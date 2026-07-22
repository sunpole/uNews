# uNews 0.3.7

Текущая версия: `0.3.7` — uNews проверяет реальные bytes и внутреннюю структуру каждого изображения до Telegram.

## Что исправлено

- Remote image check больше не использует один `HEAD`.
- Каждый pending-файл скачивается через GET и проверяется до выбора FIFO batch.
- Выбранный файл скачивается и проверяется повторно непосредственно перед Telegram.
- Telegram получает уже проверенный Buffer как multipart Blob, а не raw URL.
- Локальная команда одного патчноута использует тот же image-integrity слой.
- Расширение файла сверяется с реальным PNG/JPEG/GIF/WebP форматом.
- По умолчанию действует лимит 20 MiB, граница 20 000 px на сторону и максимальное соотношение 20:1.

## Глубокая проверка PNG

Версия `0.3.7` проверяет:

- PNG signature;
- границы и имена chunks;
- CRC каждого chunk;
- обязательный первый `IHDR`;
- допустимые bit depth и color type;
- корректный `PLTE`;
- наличие непустого `IDAT`;
- успешное zlib-декодирование IDAT;
- обязательный пустой `IEND`;
- отсутствие trailing bytes после `IEND`.

Для JPEG, GIF и WebP проверяются сигнатуры, контейнерная структура и доступные размеры.

## Проверенный инцидент

Файл uDream был доступен по правильному URL и имел расширение `.png`, поэтому старая `HEAD`-проверка считала его готовым. Telegram возвращал `IMAGE_PROCESS_FAILED`.

Глубокая диагностика доказала неверный CRC chunk `PLTE`. `pngcheck`, ImageMagick и Telegram не могли декодировать файл.

Исправленный `uDream 23.8.0` опубликован как:

```text
message_id: 54
post_url: https://t.me/uNewsLog/54
published_at: 2026-07-22T09:59:22.164Z
```

Эта запись уже находится в `data/published.json` и не публикуется повторно.

## Регрессионные тесты

Добавлен `scripts/check-image-integrity.js`.

Он проверяет:

- корректный indexed PNG;
- неверный CRC `PLTE`;
- повреждённый zlib stream при корректном CRC;
- несовпадение расширения и bytes;
- trailing bytes после `IEND`;
- обязательный remote GET;
- HTTP failure;
- лимит удалённого `Content-Length`.

`npm test` теперь включает image-integrity fixtures.

## Полный dry-run

После объединения uDream PR #24 выполнен GitHub Actions dry-run на source commit `a9af30702979e55a5aca26d12cac3366d0f48900`.

```text
projects scanned: 35
new patchnotes: 9
ready in batch: 9
reported errors: 0
would publish: 9
```

FIFO начинается с `uDream 23.8.1`. Ранее опубликованный `uDream 23.8.0` / message `54` отсутствует среди pending-записей.

## Не изменено

- строгий FIFO и порядок версий внутри проекта;
- максимум 20 публикаций за запуск;
- пауза не менее 61 секунды;
- немедленный checkpoint после каждого успешного Telegram-поста;
- Git identity до publisher-step из версии `0.3.6`;
- recovery-state и secret redaction из версии `0.3.5`;
- GitHub-first публикация и запрет реальной локальной отправки;
- maintenance-команды для уже опубликованных постов.

## Документация

- `README.md` — рабочее использование uNews;
- `docs/QUEUE_ARCHITECTURE.md` — FIFO, checkpoint и ошибки;
- `docs/IMAGE_INTEGRITY.md` — полный контракт проверки изображений;
- `SECURITY.md` — credentials и secrets;
- `docs/SECURITY_AUDIT_2026-07-18.md` — последний отдельный аудит безопасности.

## Точки восстановления

Предыдущее стабильное состояние до автоматизации сохранено в ветках:

```text
stable/manual-publishing-v0.1.0
release/v0.1.0-stable-manual
```

Версия `0.3.5` остаётся recovery-baseline, `0.3.6` — checkpoint identity baseline, `0.3.7` добавляет обязательную byte-level image integrity проверку.
