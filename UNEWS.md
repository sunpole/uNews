# Взаимодействие проекта с uNews

Любое завершённое пользовательское изменение проекта должно сопровождаться новостью в `news/`.

Обязательная пара:

```text
news/YYYY-MM-DD-project-version-short-title.md
news/YYYY-MM-DD-project-version-short-title.png или .jpg
```

Минимальный YAML:

```yaml
---
type: patch
project: Название проекта
series: safeLatinTag
title: Краткое русское название
version: 1.2.3
queued_at: 2026-07-18T18:09:08Z
repo_url: https://github.com/sunpole/PROJECT
web_url: https://sunpole.github.io/PROJECT/
image: YYYY-MM-DD-project-version-short-title.jpg
---
```

Правила для ИИ и программиста:

1. Описывать только фактически выполненные изменения.
2. Использовать следующую версию проекта, не повторять уже опубликованную.
3. Ставить `queued_at` в UTC в момент добавления новости.
4. Добавлять рабочую ссылку и реальное изображение.
5. Не включать токены, ключи, приватные данные и содержимое локального окружения.
6. Перед завершением запускать доступную проверку патчноута.
7. Не публиковать вручную: после попадания файлов в публичную ветку uNews сделает остальное.

Полная спецификация: https://github.com/sunpole/uNews/blob/main/docs/QUEUE_ARCHITECTURE.md
