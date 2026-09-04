---
type: feature
project: uNews
series: unews
title: uNews 0.3.14 — первый пост проекта, реальные изображения и безопасный repair
version: 0.3.14
queued_at: 2026-09-04T09:46:00Z
repo_url: https://github.com/sunpole/uNews
web_url: https://sunpole.github.io/uNews/
image: 2026-09-04-unews-v0-3-14-project-intro-links.png
image_origin: real
image_subject: telegram-channel
image_pipeline: unews-selfshot-v1
image_meta: 2026-09-04-unews-v0-3-14-project-intro-links.selfshot.json
---

uNews получил новое правило для истории проектов в Telegram.

Что изменилось:
— новый проект сначала публикует короткий type: intro;
— uNews запоминает Telegram-ссылку на этот главный пост;
— следующие обновления автоматически получают строку «О проекте»;
— новые публикации обязаны использовать image_origin: real;
— AI-generated, fake UI и placeholder-изображения блокируются;
— уже опубликованный пост можно исправить через GitHub Actions по сохранённому message_id без создания дубля.

Первым проектом, для которого правило полностью применено, стал uMontage:
его первый Telegram-пост превращён в короткую презентацию проекта, а дальнейшие
обновления связываются с ним автоматически.

Короткий текст для Telegram:

Обновление uNews 0.3.14: для нового проекта сначала нужен короткий intro-пост,
а все следующие новости автоматически получают ссылку «О проекте».
Новые изображения должны быть реальными, а уже опубликованный пост теперь можно
исправить безопасно без создания дубля.
