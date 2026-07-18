---
type: bugfix
project: uNews
series: unews
title: Экономное расписание без каскада Actions
version: 0.2.3
queued_at: 2026-07-18T19:24:15Z
repo_url: https://github.com/sunpole/uNews
web_url: https://sunpole.github.io/uNews/
image: 2026-07-18-unews-v0-2-3-action-limits.jpg
---

Проверена нагрузка uNews на GitHub Actions и REST API.

Что изменено:
— очередь проверяется раз в пятнадцать минут со смещением от начала часа;
— пустой проход больше не создаёт служебный коммит и не запускает лишний GitHub Pages Action;
— health heartbeat сохраняется не чаще одного раза в сутки;
— полный набор тестов убран из неизменных scheduled-проходов и остаётся обязательным для изменений кода;
— фактическая API-нагрузка документирована с запасом относительно лимита `GITHUB_TOKEN`.

Короткий текст для Telegram:
Патч uNews 0.2.3: расписание оптимизировано до четырёх проверок в час, пустые проходы больше не создают каскад коммитов и Pages Actions, а API-нагрузка остаётся с большим запасом до лимита GitHub.
