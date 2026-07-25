# uNews 0.3.8 release evidence

## Причина патча

Официальный FIFO workflow дошёл до корректного uImposition M4 PNG размером `1440×8625`, но Telegram `sendPhoto` вернул `PHOTO_INVALID_DIMENSIONS`. Исходный файл не был повреждён; его сумма сторон `10065` превышала допустимый предел.

## Реализованное исправление

- source image по-прежнему скачивается через GET;
- выполняется signature/format/dimension/CRC/zlib/trailing-bytes validation;
- безопасное изображение отправляется byte-for-byte;
- oversized non-interlaced 8-bit RGB/RGBA PNG уменьшается только в памяти;
- используется безопасная сумма сторон не больше `9800`;
- пропорции сохраняются;
- новый PNG получает корректные chunks и CRC;
- delivery copy повторно проходит полный image-integrity validator;
- исходный файл, release asset и исторический архив не меняются;
- FIFO и одиночный publisher используют один механизм.

## Regression evidence

`npm test` проверяет:

- factual-size fixture `1440×8625` становится Telegram-safe;
- итог меньше `10 MB`;
- сумма сторон не больше `9800`;
- отношение сторон не больше `20:1`;
- source Buffer не мутирует;
- output повторно валидируется;
- `1180×1189` остаётся тем же Buffer и теми же bytes;
- unsupported oversized indexed PNG блокируется до Telegram.

## Chromium evidence

- source commit: `d5d59412fb7f6c96d8133587b62d9718da64491c`;
- selector: `#telegram-photo-normalization`;
- screenshot: `news/2026-07-25-unews-v0-3-8-telegram-photo-normalization.png`;
- patchnote: `news/2026-07-25-unews-v0-3-8-telegram-photo-normalization.md`;
- screenshot и test log созданы настоящим Chromium/GitHub Actions;
- screenshot assertions: версия `0.3.8`, исходник `1440×8625`, delivery limit `≤9800 px`, `≤10 МБ`, оригинал не изменяется.

## Permanent archive

- directory: `archive/development/0.3.8/`;
- manifest: `archive/development/0.3.8/release.json`;
- ZIP: `archive/development/0.3.8/unews-v0-3-8-evidence.zip`;
- source diff: `archive/development/0.3.8/source.diff`;
- ZIP содержит screenshot, screenshot manifest, capture log, полный npm-test log, patchnote, image, version files, README и documentation.

## Git history

- functional screenshot source: `d5d59412fb7f6c96d8133587b62d9718da64491c`;
- generated news/archive commit: `0a51f201010b4d0b45f17341af3b8ed842f99cb4`;
- release push verification fix: `c816dac37b1355e743cde14a8595bd049dbb8557`;
- implementation PR: `#9`;
- merge commit, rollback branch, tag and GitHub Release are recorded only after final merge.

## После merge

`publish-version-release.yml` создаёт:

- `release/v0.3.8`;
- immutable tag `v0.3.8`;
- GitHub Release `uNews v0.3.8`;
- assets: focused screenshot and permanent evidence ZIP.

Затем официальный `publish-all-news.yml` запускается повторно. Он должен продолжить FIFO-очередь, публиковать записи с паузой не меньше 61 секунды и фиксировать каждый `post_url` сразу после успешной отправки.
