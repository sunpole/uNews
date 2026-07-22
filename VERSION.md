# uNews 0.3.7

Текущая версия: `0.3.7` — uNews проверяет реальные bytes и внутреннюю структуру каждого изображения до Telegram.

Состояние на `2026-07-22T11:45:31Z`: реальная очередь полностью восстановлена, pending `0`, errors `0`, служебный Issue №3 закрыт.

## Что исправлено

- Remote image check больше не использует один `HEAD`.
- Каждый pending-файл скачивается через GET и проверяется до выбора FIFO batch.
- Выбранный файл скачивается и проверяется повторно непосредственно перед Telegram.
- Telegram получает уже проверенный Buffer как multipart Blob, а не raw URL.
- Локальная команда одного патчноута использует тот же image-integrity слой.
- Расширение файла сверяется с реальным PNG/JPEG/GIF/WebP форматом.
- По умолчанию действует лимит 20 MiB, граница 20 000 px на сторону и максимальное соотношение 20:1.
- Source-check запрещает возврат HEAD-only проверки и требует архитектуру GET → deep validation → Blob.

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

Эта запись находится в `data/published.json` и при восстановительном запуске повторно не публиковалась.

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

`npm test` включает image-integrity fixtures и source guard архитектуры.

## Проверка actual main

После merge uNews PR #6 выполнен отдельный dry-run точного `main`.

```text
projects scanned: 35
new patchnotes: 10
ready in batch: 10
reported errors: 0
would publish: 10
```

FIFO начинался с `uDream 23.8.1` и завершался `uNews 0.3.7`. Ранее опубликованный `uDream 23.8.0` / message `54` отсутствовал среди pending-записей.

## Реальное подтверждение

Штатный trigger commit:

```text
763650e47aada175bd23332c1a9f05d454437e63
```

Опубликованы десять сообщений:

```text
uDream 23.8.1 → https://t.me/uNewsLog/55
uDream 23.8.2 → https://t.me/uNewsLog/56
uDream 23.8.3 → https://t.me/uNewsLog/57
uDream 23.8.4 → https://t.me/uNewsLog/58
uDream 23.8.5 → https://t.me/uNewsLog/59
uDream 23.8.6 → https://t.me/uNewsLog/60
uDream 23.8.7 → https://t.me/uNewsLog/61
uNews 0.3.5 → https://t.me/uNewsLog/62
uNews 0.3.6 → https://t.me/uNewsLog/63
uNews 0.3.7 → https://t.me/uNewsLog/64
```

Каждая запись получила отдельный commit `Record published uNews item: ...`.

Финальный state commit:

```text
064cbde39ca3c46cf746bcce65027eef517f45ef
```

Финальное состояние:

```text
last_attempt_status: success
pending_count: 0
ready_project_count: 0
error_count: 0
selected_key: null
last_error: null
data/errors.json: []
Issue #3: closed / completed
```

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
- `docs/QUEUE_RECOVERY_2026-07-22.md` — полный отчёт о сбое, исправлениях и реальной публикации;
- `SECURITY.md` — credentials и secrets;
- `docs/SECURITY_AUDIT_2026-07-18.md` — последний отдельный аудит безопасности.

## Точки восстановления

Предыдущее стабильное состояние до автоматизации сохранено в ветках:

```text
stable/manual-publishing-v0.1.0
release/v0.1.0-stable-manual
```

Версия `0.3.5` остаётся recovery-baseline, `0.3.6` — checkpoint identity baseline, `0.3.7` — подтверждённый image-integrity baseline с успешной реальной очередью.
