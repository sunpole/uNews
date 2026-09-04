# uNews 0.3.15

Текущая версия: `0.3.15` — SelfShot Pipeline для реальных визуалов самого uNews.

## Что изменилось

- добавлен `tools/Prepare-uNewsSelfShot.ps1/.cmd`;
- raw Telegram screenshot обрабатывается локально и не коммитится;
- preset отрезает левую колонку личных чатов;
- final image нормализуется до 1600x1000;
- рядом создаётся `*.selfshot.json` с SHA-256, размером и crop metadata;
- patchnote получает обязательные `image_origin`, `image_subject`,
  `image_pipeline`, `image_meta`;
- policy блокирует self-post uNews без реального визуала самого uNews.

## Рабочая модель

`uNews пишет о себе → показываем реальный Telegram/queue/workflow uNews`.

`uNews публикует другой проект → показываем реальный визуал этого проекта`.
