# uNews SelfShot Pipeline

Для постов `project: uNews` картинка должна показывать реальную работу самого
uNews: Telegram channel/post, publish workflow или queue status.

## Windows workflow

1. Открыть Telegram Desktop на канале uNews.
2. Прокрутить нужный публичный пост ближе к верхней части окна.
3. Развернуть Telegram и сделать screenshot всего экрана.
4. Raw screenshot не добавлять в Git.
5. Запустить:

```text
tools\Prepare-uNewsSelfShot.cmd "C:\path\screen.png" "news\YYYY-MM-DD-unews-post.md" -Open
```

Скрипт:
- отрезает левую колонку личных чатов;
- сохраняет public channel + Telegram wallpaper;
- нормализует картинку до 1600x1000;
- создаёт `*.selfshot.json` с SHA-256 и crop metadata;
- сам добавляет в patchnote `image_origin`, `image_subject`,
  `image_pipeline`, `image_meta`;
- не копирует raw screenshot в репозиторий.

## Capture contract

Preset `TelegramChannel` рассчитан на landscape Telegram Desktop screenshot.
Нужный пост должен быть виден ближе к верхней части central/public area.
Если Telegram UI заметно изменится, сначала обновить preset и regression test.

## Required front matter

```yaml
image_origin: real
image_subject: telegram-channel
image_pipeline: unews-selfshot-v1
image_meta: example.selfshot.json
```

Allowed subjects:
- `telegram-channel`;
- `telegram-post`;
- `publish-workflow`;
- `queue-status`.

AI-generated image, fake UI и generic placeholder не допускаются как основной
visual поста о самом uNews.

Raw screenshots считаются локальными входными данными и могут содержать private
chat list. В public Git попадает только подготовленный crop и sanitized metadata
без полного локального пути.
