---
type: bugfix
project: uNews
series: unews
title: Git identity настраивается до первого checkpoint
version: 0.3.6
queued_at: 2026-07-22T10:10:00Z
repo_url: https://github.com/sunpole/uNews
web_url: https://sunpole.github.io/uNews/
image: 2026-07-22-unews-v0-3-6-checkpoint-identity.png
image_source: document-render
image_target: assets/covers/unews-v0.3.6-checkpoint-identity.svg
image_commit: 55de1f73ebcda445492d8e284ec90259aae669af
image_captured_at: 2026-07-22T10:06:01Z
---

# uNews 0.3.6: Git identity готова до первого per-post checkpoint

Recovery-патч `0.3.5` успешно сохранил точную причину второго сбоя очереди. Telegram уже принял первый исправленный uDream-пост, однако внутренний Git checkpoint не смог создать commit, потому что имя и email `github-actions[bot]` настраивались только в более позднем fallback-шаге.

Подтверждённый результат первого поста:

- патчноут: `uDream 23.8.0`;
- Telegram `message_id`: `54`;
- ссылка: `https://t.me/uNewsLog/54`;
- `published_at`: `2026-07-22T09:59:22.164Z`;
- ключ уже находится в `data/published.json`, поэтому повторная публикация исключена.

Что исправлено:

- добавлен отдельный шаг `Configure checkpoint Git identity` до `Publish new patchnotes`;
- `git config user.name` и `git config user.email` выполняются раньше `npm run publish:all`;
- внутренний `checkpointPublishedState()` снова может создавать commit сразу после каждого успешного Telegram-поста;
- fallback `Commit queue state` сохранён как дополнительная защита;
- `scripts/check-source.js` проверяет порядок workflow-шагов и обе команды Git identity;
- source-check также требует сохранения `UNEWS_GIT_CHECKPOINT: "1"`.

Не изменены:

- строгий FIFO и порядок версий внутри проекта;
- максимум 20 публикаций за запуск;
- пауза не менее 61 секунды;
- Telegram-клиент и policy;
- recovery-state `0.3.5`;
- редактирование token-like строк;
- запрет реальной локальной публикации.

После объединения патча очередь продолжится с первой ещё не опубликованной записью. `uDream 23.8.0` не будет отправлен повторно, а новые per-post commits должны появляться сразу после каждой следующей публикации.

Короткий текст для Telegram:

Исправление uNews 0.3.6 возвращает немедленные GitHub checkpoint после каждого Telegram-поста: identity `github-actions[bot]` теперь настраивается до publisher-step и защищена source-check. Уже опубликованный uDream 23.8.0 сохранён как message 54 и повторно отправляться не будет; FIFO, пауза 61 секунда и recovery-state сохранены.
