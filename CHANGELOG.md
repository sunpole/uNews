# Changelog

## 0.3.13 — 2026-08-11

### Fixed

- Labelled terminal hashtag lines such as `Хэштеги: ...` are rejected before publication.
- Legacy repair waits for Telegram rate limits, skips already repaired messages and retries a transient network failure.

### Verified

- The read-only audit reports 95 clean published captions: no duplicate footer, likely English caption or unresolved source remains.

## 0.3.12 — 2026-08-11

### Added

- Read-only published-caption audit for a controlled cleanup of legacy Telegram posts.

### Fixed

- Source-order guard is line-ending independent on Windows and GitHub Actions.
- Controlled caption repair restored Russian one-link, one-tag-set captions for uChurch messages 80-100; message 102 and 103 now use safe synthetic CRM screenshots.

## 0.3.11 — 2026-08-11

### Fixed

- Policy blocks a manually written URL or a multi-tag footer in a patchnote body.
- The Telegram publisher remains the sole owner of the one-link, one-tag-set footer.

### Verified

- Fixtures prove that a manual Russian `Ссылка:` line and a manual hashtag footer fail before publication.

## 0.3.10 — 2026-07-26

### Fixed

- `type: audit` is now accepted as a safe queue publication type.
- uDream audit reports can pass publication policy instead of remaining blocked with `Unsupported type: audit`.

### Changed

- Audit posts receive a compact `Аудит.` prefix when their Telegram text does not already contain audit/report wording.

## 0.3.9 — 2026-07-26

### Fixed

- `news/README.md` and other undated Markdown support files are no longer treated as queued patchnotes.
- `type: documentation` is now accepted as an alias for a documentation update.
- Queue fixtures now prove that only dated `YYYY-MM-DD-*.md` files enter the publishing queue.

### Changed

- The queue scanner now has an explicit `isPublishableNewsMarkdown` predicate.
- Documentation update wording is applied to both `docs` and `documentation` types.

## 0.3.8 — 2026-07-25

### Added

- dependency-free Telegram photo normalizer for non-interlaced 8-bit RGB/RGBA PNG;
- in-memory nearest-neighbour resize that preserves the source file and its archive;
- explicit `sendPhoto` safety limits: 10 MB, dimension sum 10000, aspect ratio 20:1;
- internal safe dimension target of 9800 px;
- source-versus-delivery image summaries in dry-run and real publication logs;
- regression test for the factual `1440×8625` uImposition M4 screenshot;
- regression test proving the safe `1180×1189` M6 screenshot remains byte-for-byte unchanged;
- rejection of unsupported oversized indexed PNG before Telegram;
- focused public proof block on the uNews website;
- machine-readable `VERSION.json`.

### Changed

- FIFO publication and single-project publication both prepare Telegram-safe copies only after source GET, CRC, zlib, format and dimension validation;
- original project images remain untouched in their repositories and historical archives;
- `npm test` now includes Telegram photo normalization fixtures;
- the visible uNews site and package metadata are synchronized to `0.3.8`.

### Fixed

- real Telegram publication no longer stops with `PHOTO_INVALID_DIMENSIONS` when an otherwise valid Chromium screenshot exceeds the photo dimension-sum limit.

### Verified

- `1440×8625` is normalized to a valid PNG with dimension sum at most 9800;
- output remains below 10 MB and within 20:1 aspect ratio;
- the source Buffer is not mutated;
- output bytes pass the same deep image-integrity validator again;
- `1180×1189` is delivered without any byte changes;
- the complete existing queue/source/image test suite remains green.

Earlier release history remains preserved in `news/`, Git history, README, audits and published Telegram checkpoints.
