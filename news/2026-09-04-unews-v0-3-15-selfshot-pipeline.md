---
type: feature
project: uNews
series: unews
title: uNews 0.3.15 — SelfShot Pipeline для реальных Telegram-визуалов
version: 0.3.15
queued_at: 2026-09-04T11:04:00Z
repo_url: https://github.com/sunpole/uNews
web_url: https://sunpole.github.io/uNews/
image: 2026-09-04-unews-v0-3-15-selfshot-pipeline.jpg
image_origin: real
image_subject: telegram-channel
image_pipeline: unews-selfshot-v1
image_meta: 2026-09-04-unews-v0-3-15-selfshot-pipeline.selfshot.json
---

uNews получил автоматизированный SelfShot Pipeline для собственных публикаций.

Что сделано:
— реальный screenshot Telegram Desktop обрабатывается локально одной командой;
— левая колонка личных чатов не попадает в публичный кадр;
— final image получает единый размер, SHA-256 и sidecar metadata;
— front matter image_origin/image_subject/image_pipeline/image_meta заполняется автоматически;
— policy блокирует self-post uNews, если он визуально показывает другой проект вместо самого uNews.

Короткий текст для Telegram:

Обновление uNews 0.3.15: SelfShot Pipeline превращает реальный скрин Telegram
в безопасный public visual одной командой. Личная колонка чатов не попадает в Git,
а новые посты о самом uNews теперь обязаны показывать реальную работу uNews.
