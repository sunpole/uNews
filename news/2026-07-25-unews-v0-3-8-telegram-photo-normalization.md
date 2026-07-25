---
type: bugfix
project: uNews
series: unews
title: uNews: длинные PNG больше не останавливают Telegram-очередь
version: 0.3.8
queued_at: 2026-07-25T05:36:27Z
repo_url: https://github.com/sunpole/uNews
web_url: https://sunpole.github.io/uNews/
image: 2026-07-25-unews-v0-3-8-telegram-photo-normalization.png
image_text: uNews 0.3.8 сохраняет исходный Chromium PNG 1440×8625 и создаёт только для Telegram безопасную копию с суммой сторон не больше 9800 px.
image_source: playwright
image_target: selector/#telegram-photo-normalization
image_commit: d5d59412fb7f6c96d8133587b62d9718da64491c
image_captured_at: 2026-07-25T05:36:26.952Z
---

# uNews: длинные PNG больше не останавливают Telegram-очередь

uNews теперь автоматически уменьшает только отправляемую PNG-копию, если исходный screenshot превышает ограничения Telegram sendPhoto. Оригинал, release asset и исторический архив остаются неизменными.

Что исправлено:

- исходный файл по-прежнему проходит GET, signature, CRC, zlib и dimension validation;
- длинный non-interlaced RGB/RGBA PNG уменьшается только в памяти непосредственно перед Telegram;
- пропорции сохраняются, сумма сторон получает безопасный предел 9800 px;
- результат повторно проходит полный image-integrity validator;
- dry-run показывает исходные и отправляемые размеры;
- одиночный publisher и общая FIFO-очередь используют один механизм;
- неподдерживаемый oversized формат блокируется до Telegram понятной ошибкой.

Проверенный результат:

- фактический uImposition M4-размер 1440×8625 успешно нормализуется;
- безопасный M6-размер 1180×1189 остаётся byte-for-byte неизменным;
- source Buffer не мутирует;
- Telegram-копия остаётся меньше 10 МБ, сумма сторон не больше 9800, отношение сторон не больше 20:1;
- полный npm test, включая очередь и deep image-integrity, проходит.

После публикации 0.3.8 официальный FIFO workflow повторно обработает ожидающие новости uImposition M4, M5 и M6 с паузой не меньше 61 секунды.

Короткий текст для Telegram:

uNews 0.3.8 исправил остановку очереди на длинных скриншотах. Исходный PNG сохраняется без изменений, а для Telegram бот автоматически создаёт безопасную копию и снова проверяет её перед отправкой.
