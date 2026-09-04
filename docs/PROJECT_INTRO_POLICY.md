# Project intro, real image and repair policy

## Новый проект

Новая `series` сначала публикует `type: intro`. Intro коротко отвечает:
что это за проект, какую практическую задачу он решает и какой у него текущий
статус.

После Telegram-публикации URL сохраняется в `data/project-intros.json`.
Все следующие сообщения получают строку:

```text
О проекте: https://t.me/...
```

Policy добавляет её автоматически.

## Реальное изображение

Новые публикации используют только `image_origin: real`.

Под real понимается фактический screenshot, фотография или экспорт результата.
AI-generated, mock/fake UI и generic placeholder запрещены. Byte-level
image-integrity остаётся отдельной технической проверкой.

## Исправление опубликованного поста

Дубликат не публикуется. `.github/unews-edit-request.json` указывает existing
published key и режим `caption` или `media`. Workflow берёт сохранённый
message_id, читает актуальный public source, повторно применяет policy и
редактирует именно исходное Telegram-сообщение.
