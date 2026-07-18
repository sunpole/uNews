# AGENTS.md — инструкции для Codex по проекту uNews

## 1. Назначение проекта

uNews — это система публикации новостей, патчноутов и отчётов разработки по u-проектам в Telegram-канал.

Основная задача проекта:
- хранить патчноуты в репозитории;
- автоматически публиковать патчноуты в Telegram-канал;
- прикреплять к каждому патчноуту изображение;
- сохранять единый стиль описаний обновлений;
- давать ссылку на веб-просмотр версии проекта, если такую версию можно показать;
- не публиковать секреты, токены и приватные данные.

Основные проекты автора:
- uSugar;
- uDream;
- uChurch;
- GOART;
- Time Rift;
- 500 Tower Defense / 500ТД;
- другие проекты автора.

---

## 2. Правило названий u-проектов

В человекочитаемых текстах использовать стиль:

- uNews
- uSugar
- uDream
- uChurch

Правило:

```text
маленькая буква u + основное слово с большой буквы
```

Пример правильно:

```text
uNews — новости u-проектов
```

Пример неправильно:

```text
Unews
UNews
u-news
u news
```

Название репозитория может быть маленькими буквами:

```text
unews
```

Но в README, патчноутах, описаниях, Telegram-постах и документации писать:

```text
uNews
```

---

## 3. Главные файлы и папки проекта

Ожидаемая структура проекта:

```text
unews/
├── .env
├── .gitignore
├── AGENTS.md
├── README.md
├── package.json
├── news/
├── previews/
├── scripts/
├── assets/
│   └── covers/
└── .github/
    └── workflows/
```

Папка `news/` — главная папка для патчноутов.

Каждый патчноут должен иметь отдельный `.md`-файл.

Рядом с `.md`-файлом обязательно размещать изображение с безопасным именем без каталогов и `..`.

Пример:

```text
news/2026-06-14-usugar-settings.md
news/2026-06-14-usugar-settings.png
```

Папка `previews/` предназначена для статических веб-версий проектов и патчей, которые можно открыть через GitHub Pages без сервера.

---

## 4. Формат имени файла патчноута

Файлы патчноутов создавать по шаблону:

```text
YYYY-MM-DD-project-short-title.md
```

Примеры:

```text
2026-06-14-usugar-settings.md
2026-06-15-udream-favicon.md
2026-06-16-uchurch-members.md
2026-06-17-goart-docs.md
2026-06-18-500td-balance-patch.md
```

Правила:
- использовать только латиницу;
- использовать маленькие буквы;
- пробелы заменять дефисами;
- не использовать русские буквы в имени файла;
- не использовать специальные символы;
- дата всегда в начале имени файла;
- для изображения использовать то же имя файла.

Пример пары файлов:

```text
news/2026-06-18-500td-balance-patch.md
news/2026-06-18-500td-balance-patch.png
```

---

## 5. Обязательный формат патчноута

Каждый патчноут должен начинаться с YAML-блока:

```markdown
---
type: patch
project: 500 Tower Defense
series: 500td
title: Баланс башен и первые волны
version: 0.1.2
queued_at: 2026-07-18T15:40:00Z
repo_url: https://github.com/sunpole/500
web_url: https://sunpole.github.io/uNews/previews/500td/0.1.2/
branch: feature/500td-balance
image: 2026-06-18-500td-balance-patch.png
---
```

Обязательные поля:

```text
type
project
series
title
version
queued_at
repo_url или web_url
image или images
```

Если для патча уже есть веб-версия, обязательно указывать:

```text
web_url
```

Если патч относится к ветке, которая ещё не находится в `main`, обязательно указывать:

```text
branch
```

Версию обязательно указывать:

```text
version
```

`queued_at` обязательно задаётся точным UTC-временем в формате `YYYY-MM-DDTHH:mm:ssZ`. Значение без `Z`, без секунд или с локальным временем блокирует публикацию.

---

## 6. Поле type

Поле `type` определяет тип публикации и будущую обложку.

Разрешённые значения:

```text
intro
test
release
patch
bugfix
docs
ui
feature
warning
idea
roadmap
```

Описание значений:

```text
intro — первая презентационная публикация о проекте

test — тестовая публикация
release — заметный релиз или готовое обновление
patch — обычный патч
bugfix — исправление ошибки
docs — документация
ui — интерфейс, дизайн, внешний вид
feature — новая функция
warning — важное предупреждение, риск или проблема
idea — идея, которая ещё не реализована
roadmap — планы разработки
```

Если неясно, какой тип выбрать, использовать:

```text
patch
```

---

## 7. Поле project

Поле `project` содержит человекочитаемое название проекта.

Писать названия так:

```text
uNews
uSugar
uDream
uChurch
GOART
Time Rift
500 Tower Defense
Albion Craft
```

Не писать:

```text
UNews
Unews
usugar
udream
uchurch
```

Для u-проектов использовать стиль:

```text
uSugar
uDream
uChurch
uNews
```

Для игры 500 Tower Defense можно использовать в тексте короткую метку:

```text
500ТД
```

Но в поле `project` писать полное название:

```text
500 Tower Defense
```

---

## 8. Поле series

Поле `series` нужно для группировки публикаций по одному проекту или одной ветке новостей.

Примеры:

```text
unews
usugar
udream
uchurch
500td
goart
time-rift
```

Для игры 500 Tower Defense использовать:

```text
series: 500td
```

Codex должен сохранять один и тот же `series` для всех публикаций и патчноутов одного проекта.

Идея: сначала создаётся главная презентационная публикация проекта с `type: intro`, а все дальнейшие патчноуты относятся к той же серии через `series`.

---

## 9. Главная публикация проекта

Перед первыми патчноутами нового проекта желательно создать презентационную публикацию.

Для 500 Tower Defense пример файла:

```text
news/2026-06-18-500td-intro.md
news/2026-06-18-500td-intro.png
```

Пример YAML:

```markdown
---
type: intro
project: 500 Tower Defense
series: 500td
title: Представление проекта 500 Tower Defense
repo_url: https://github.com/sunpole/500
web_url: https://sunpole.github.io/500/
image: 2026-06-18-500td-intro.png
---
```

Текст главной публикации должен:
- кратко представить проект;
- объяснить идею игры;
- описать текущий статус;
- дать ссылку на репозиторий;
- дать ссылку на веб-версию, если она уже есть;
- не выдумывать готовность функций, которых нет.

---

## 10. Связь патчноутов с главной публикацией

Все патчноуты проекта должны использовать тот же `series`, что и главная публикация.

Пример:

```markdown
---
type: patch
project: 500 Tower Defense
series: 500td
title: Второй патч баланса
version: 0.1.2
repo_url: https://github.com/sunpole/500
web_url: https://sunpole.github.io/uNews/previews/500td/0.1.2/
branch: feature/balance-v012
image: 2026-06-19-500td-balance-v012.png
---
```

Если в Telegram-боте будет реализована публикация ответом к главному посту, скрипт должен использовать `series` для поиска родительской публикации.

Если такой логики ещё нет, `series` всё равно обязательно сохранять в файле патчноута для будущей группировки.

---

## 11. Ссылки на веб-версии патчей

В каждом патчноуте должна быть ссылка на веб-версию патча, если проект можно открыть в браузере.

Поле:

```text
web_url
```

Если патч уже в `main` и GitHub Pages проекта настроен, можно использовать ссылку проекта:

```text
https://sunpole.github.io/500/
```

Если патч ещё не в `main`, Codex должен подготовить отдельную статическую preview-версию без сервера.

Рекомендуемая структура preview-версий в uNews:

```text
previews/
└── 500td/
    └── 0.1.2/
        ├── index.html
        ├── style.css
        ├── app.js
        └── assets/
```

И ссылка в патчноуте:

```text
https://sunpole.github.io/uNews/previews/500td/0.1.2/
```

Если проект удобнее упаковать в один файл, разрешено делать так:

```text
previews/500td/0.1.2/index.html
```

Внутри `index.html` могут быть встроены HTML, CSS и JS.

Главное требование:

```text
preview-версия должна открываться через GitHub Pages без сервера, backend, сборщика и локальных зависимостей.
```

---

## 12. Правило упаковки проектов для GitHub Pages

Если Codex готовит веб-просмотр проекта или конкретного патча, он должен упаковать проект в статический формат:

```text
HTML + CSS + JS
```

Разрешено:
- один `index.html` со встроенными стилями и скриптами;
- несколько файлов: `index.html`, `style.css`, `app.js`;
- папка `assets/` для изображений, аудио и других статических файлов.

Запрещено для preview-версии:
- backend;
- серверная логика;
- Node.js-сервер;
- Vite/dev-server как обязательное условие просмотра;
- базы данных, требующие сервер;
- API-ключи и секреты в клиентском коде.

Если проект изначально использует сборщик, Codex должен подготовить статическую сборку или отдельный preview-вариант, который можно открыть с GitHub Pages.

---

## 13. Изображения для патчноутов

Для каждого патчноута обязательно требуется изображение.

Автор может создать изображение самостоятельно и положить рядом с `.md`-файлом.

Правило:

```text
имя изображения должно совпадать с именем .md-файла
```

Пример:

```text
news/2026-06-18-500td-balance-patch.md
news/2026-06-18-500td-balance-patch.png
```

Разрешённые форматы:

```text
.png
.jpg
.webp
```

Предпочтительный формат:

```text
.png
```

Если изображения нет, Codex должен явно указать, что изображение нужно добавить перед публикацией.

Codex не должен считать патчноут полностью готовым к публикации, если нет изображения или fallback-обложки.

---

## 14. Стиль текста патчноута

Писать на русском языке.

Стиль:
- понятно;
- спокойно;
- профессионально;
- без лишней рекламы;
- без выдуманных фактов;
- без обещаний, которые ещё не сделаны;
- без длинных технических подробностей, если они не нужны читателю.

Патчноут должен быть понятен не только разработчику, но и обычному читателю.

Не использовать длинные абзацы.

Лучше писать короткими блоками.

---

## 15. Рекомендуемая структура текста патчноута

Каждый патчноут желательно оформлять так:

```markdown
---
type: patch
project: uNews
series: unews
title: Краткий заголовок обновления
version: 0.1.0
repo_url: https://github.com/sunpole/uNews
web_url: https://sunpole.github.io/uNews/
image: 2026-06-14-unews-test.png
---

Краткое описание обновления в 1–2 предложениях.

Что сделано:
— пункт 1;
— пункт 2;
— пункт 3.

Что изменилось для пользователя:
— пункт 1;
— пункт 2.

Технически:
— пункт 1;
— пункт 2.

Ссылка на веб-версию:
https://sunpole.github.io/uNews/

Статус:
краткое состояние после обновления.
```

Блок `Технически` можно не использовать, если технических деталей мало.

---

## 16. Пример патчноута для 500 Tower Defense

```markdown
---
type: patch
project: 500 Tower Defense
series: 500td
title: Первые патчи баланса и интерфейса
version: 0.1.1
repo_url: https://github.com/sunpole/500
web_url: https://sunpole.github.io/uNews/previews/500td/0.1.1/
branch: dev/500td-patch-001
image: 2026-06-18-500td-first-patches.png
---

Подготовлены первые изменения для 500 Tower Defense после начальной версии проекта.

Что сделано:
— описать первый реальный патч;
— описать второй реальный патч;
— уточнить, что изменилось в игровом процессе, интерфейсе или балансе.

Что изменилось для игрока:
— кратко описать пользу изменений;
— указать, что можно проверить в веб-версии.

Ссылка на веб-версию патча:
https://sunpole.github.io/uNews/previews/500td/0.1.1/

Статус:
патч подготовлен для просмотра и дальнейшего тестирования.
```

Важно: Codex должен описывать только реальные изменения. Если два патча уже есть в коде, но нигде не описаны, Codex должен изучить изменения в коде и сформировать описание на основе фактов.

---

## 17. Подбор изображения по type

Если рядом с патчноутом нет изображения, в будущем использовать обложку по типу:

```text
type: docs     → assets/covers/docs.png
type: bugfix   → assets/covers/bugfix.png
type: release  → assets/covers/release.png
type: ui       → assets/covers/ui.png
type: warning  → assets/covers/warning.png
type: idea     → assets/covers/idea.png
type: roadmap  → assets/covers/roadmap.png
type: patch    → assets/covers/default.png
```

Если подходящей обложки нет, использовать:

```text
assets/covers/default.png
```

---

## 18. Что нельзя делать

Нельзя:
- публиковать токены Telegram;
- публиковать содержимое `.env`;
- добавлять `.env` в GitHub;
- вставлять секреты в README;
- вставлять секреты в патчноуты;
- отправлять в Telegram внутренние ключи, пароли, токены;
- писать «готово», если функция только запланирована;
- выдумывать изменения, которых не было;
- удалять существующую документацию без необходимости;
- создавать preview-версию, которая требует локальный сервер для просмотра.

---

## 19. Правила работы с `.env`

Файл `.env` предназначен только для локальной работы.

Он может содержать:

```env
TELEGRAM_BOT_TOKEN=token_from_botfather
TELEGRAM_CHANNEL_ID=@uNewsLog
BOT_USERNAME=@uNewsDev_bot
```

Файл `.env` должен быть в `.gitignore`.

Никогда не коммитить `.env`.

Для GitHub Actions использовать только GitHub Secrets:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_CHANNEL_ID
```

### Credentials diagnostics / Unauthorized

Перед реальной публикацией Codex должен уметь безопасно проверить Telegram-настройки:

```bash
npm run diagnose:telegram
```

Диагностика должна показывать только:

```text
TELEGRAM_BOT_TOKEN: present/missing
TELEGRAM_CHANNEL_ID: present/missing
BOT_USERNAME: present/missing
bot getMe: OK/FAILED
channel target: @uNewsLog
channel getChat: OK/FAILED
```

Токен нельзя печатать целиком, частично, в URL, в ошибках, в патчноутах или в итоговом отчёте.

Если Telegram возвращает `401 Unauthorized` на `getMe`, `sendPhoto` или `sendMessage`, это почти всегда означает, что `TELEGRAM_BOT_TOKEN` отсутствует, отозван, введён неверно или не относится к нужному боту. В таком случае Codex не должен править патчноут, YAML или изображение как причину ошибки; нужно попросить пользователя заменить `TELEGRAM_BOT_TOKEN` в локальном `.env` и, если публикация должна идти через Actions, в GitHub Secrets репозитория `sunpole/uNews`.

Если локальный `.env` исправлен и `npm run diagnose:telegram` показывает `getMe: OK`, можно повторить dry-run/check. Реальная публикация новых постов должна идти через GitHub Actions, а не с локального компьютера. Если менялся только `.env`, коммит делать не нужно.

### GitHub-first publishing

Основной путь публикации:

```text
проект -> public news/*.md + image -> GitHub -> uNews GitHub Actions -> @uNewsLog
```

Codex не должен считать локальный `npm run publish:all` или `npm run publish:projects` основным способом публикации. Локально разрешены:

```bash
npm run publish:projects:check -- <path-to-news.md>
npm run publish:all:check
npm run diagnose:telegram
npm run check:fixtures
```

Реальные publish-команды должны отправлять Telegram-посты только внутри GitHub Actions (`GITHUB_ACTIONS=true`). Локальный реальный publish блокируется по умолчанию.

Workflow `.github/workflows/publish-all-news.yml` является главным publisher:

- `workflow_dispatch dry_run=true` запускает check;
- `workflow_dispatch dry_run=false` публикует;
- schedule публикует новые pending patchnotes;
- после успешной публикации обновляет `data/published.json`.

`data/published.json` сохраняет совместимость через массив `published` и может хранить дополнительные `details` для новых публикаций: `method`, `message_ids`, `post_url`, `published_at`.

---

## 20. Правила для Telegram-поста

Telegram-пост должен быть коротким и понятным.

Рекомендуемый вид:

```text
🛠 500ТД — Первые патчи баланса и интерфейса

Подготовлены первые изменения для 500 Tower Defense после начальной версии проекта.

Что сделано:
— описан первый патч;
— описан второй патч;
— добавлена ссылка на веб-версию для просмотра.

🎮 Веб-версия:
https://sunpole.github.io/uNews/previews/500td/0.1.1/

🔗 GitHub:
https://github.com/sunpole/500
```

Не делать пост слишком длинным.

Если текст слишком длинный, сокращать для Telegram, но не портить исходный `.md`-файл.

### Обязательный footer Telegram-поста

Финальная подпись Telegram должна собираться policy-слоем, а не копироваться напрямую из блока `Короткий текст для Telegram`.

В каждом посте обязательны:

```text
Ссылка: <web_url или repo_url/branch>

#<softwareEnglish> #<softwareRussian> #uNews #Sunpole
```

Правило ссылки:

- если есть `web_url`, использовать его;
- если `web_url` нет, использовать `repo_url`;
- если есть `branch` и нет `web_url`, использовать ссылку на ветку GitHub;
- если нет ни `web_url`, ни `repo_url`, публикацию блокировать.

Обязательные hashtag mappings:

```text
uSugar -> #uSugar #тыСахар #uNews #Sunpole
uNews -> #uNews #тыНовости #Sunpole
uDream -> #uDream #тыСон #uNews #Sunpole
uChurch -> #uChurch #тыЦерковь #uNews #Sunpole
500 Tower Defense -> #500TD #500ТД #uNews #Sunpole
```

Если mapping неизвестен, check должен упасть с понятной ошибкой и потребовать добавить mapping.

Для `type: patch`, `docs`, `feature`, `bugfix`, `release` финальный caption обязан содержать слово `патч`, `обновление`, `релиз` или `документационное обновление`. Если автор патчноута забыл это в коротком тексте, policy добавляет компактную вводную фразу автоматически.

Публикация блокируется, если найдено подозрение на секреты, `.env`, token-like строки, `TELEGRAM_BOT_TOKEN`, `BOT_TOKEN`, `DEEPSEEK_API_KEY`. Для `project: uSugar` дополнительно блокировать приватные Telegram identifiers, ngrok URL и явные glucose-like медицинские значения.

Пост `https://t.me/uNewsLog/8` был опубликован до этого правила и затем исправлен через `editMessageCaption`: ссылка и хештеги добавлены без создания дубля. Дубликат поста ради footer создавать нельзя.

---

## 21. Правила для Codex при создании патчноута

Когда Codex получает задачу создать патчноут, он должен:

1. Определить проект.
2. Определить тип изменения.
3. Определить `series`.
4. Проверить реальные изменения в коде или документации.
5. Создать `.md`-файл в папке `news/`.
6. Назвать файл по шаблону `YYYY-MM-DD-project-short-title.md`.
7. Заполнить YAML-блок.
8. Описать изменения простым русским языком.
9. Добавить `repo_url`, если известен репозиторий.
10. Добавить `web_url`, если есть веб-версия или preview.
11. Добавить `branch`, если патч относится не к main-ветке.
12. Проверить наличие изображения рядом с `.md`-файлом.
13. Не выдумывать несуществующие изменения.
14. Не вставлять секреты.
15. Проверить, что `.env` не попадает в коммит.

---

## 22. Минимальный патчноут

Если информации мало, использовать минимальный шаблон:

```markdown
---
type: patch
project: uNews
series: unews
title: Краткое название изменения
image: имя-файла.png
---

Краткое описание изменения.

Что сделано:
— описать главное изменение.

Статус:
описать текущее состояние.
```

---

## 23. Патчноут для документации

```markdown
---
type: docs
project: uNews
series: unews
title: Обновление документации
repo_url: https://github.com/sunpole/uNews
image: 2026-06-14-unews-docs.png
---

Обновлена документация проекта.

Что сделано:
— уточнено назначение проекта;
— добавлены правила оформления патчноутов;
— описана структура файлов;
— зафиксированы инструкции для Codex.

Что изменилось для пользователя:
— стало понятнее, как создавать новые патчноуты;
— снижена вероятность ошибок при публикации.

Статус:
документация готова к дальнейшему расширению.
```

---

## 24. Патчноут для исправления ошибки

```markdown
---
type: bugfix
project: uNews
series: unews
title: Исправление публикации в Telegram
repo_url: https://github.com/sunpole/uNews
image: 2026-06-14-unews-telegram-bugfix.png
---

Исправлена проблема, мешавшая корректной публикации патчноута в Telegram-канал.

Что сделано:
— уточнена обработка токена Telegram;
— проверено значение `TELEGRAM_CHANNEL_ID`;
— обновлена логика отправки сообщения.

Что изменилось для пользователя:
— публикация патчноутов стала стабильнее.

Статус:
исправление готово к проверке через GitHub Actions.
```

---

## 25. Патчноут для новой функции

```markdown
---
type: feature
project: uNews
series: unews
title: Добавление публикации с изображением
repo_url: https://github.com/sunpole/uNews
image: 2026-06-14-unews-image-publishing.png
---

Добавлена подготовка публикации патчноутов с изображением.

Что сделано:
— добавлена проверка изображения рядом с `.md`-файлом;
— подготовлена отправка фото в Telegram;
— добавлен fallback на текстовую публикацию, если изображения нет.

Что изменилось для пользователя:
— патчноуты смогут выглядеть как полноценные посты с обложкой.

Статус:
функция готовится к первому тесту.
```

---

## 26. Патчноут для идеи

```markdown
---
type: idea
project: uNews
series: unews
title: Идея еженедельного отчёта
repo_url: https://github.com/sunpole/uNews
image: 2026-06-14-unews-weekly-report-idea.png
---

Добавлена идея еженедельного отчёта по разработке.

Суть идеи:
— собирать изменения за неделю;
— группировать их по проектам;
— публиковать один общий отчёт в Telegram-канал.

Польза:
— канал не будет засоряться мелкими сообщениями;
— история разработки станет понятнее;
— подписчики смогут видеть общий прогресс.

Статус:
идея сохранена для будущей реализации.
```

---

## 27. Проверка перед завершением задачи

Перед завершением любой задачи Codex должен проверить:

```text
.env не добавлен в коммит
секреты не попали в код
патчноут лежит в news/
имя файла написано латиницей
YAML-блок заполнен
version указан в семантическом формате
queued_at указан в точном UTC-формате YYYY-MM-DDTHH:mm:ssZ
project указан правильно
series указан правильно
type указан правильно
title не пустой
image указан и файл изображения существует или есть fallback-обложка
web_url указан, если есть веб-версия патча
branch указан, если патч не из main-ветки
preview открывается как статический сайт без сервера
текст написан на русском
нет выдуманных фактов
нет случайного токена Telegram
```

---

## 28. Главный принцип

Главная цель Codex в этом проекте:

```text
Каждое изменение проекта должно быть понятно описано, безопасно сохранено в репозитории, снабжено изображением, связано с нужной серией проекта и готово к публикации в Telegram-канал uNews.
```

## 29. Автоматическая очередь v0.2.0

Для любого нового патчноута обязательно указывать точное UTC-время:

```yaml
queued_at: 2026-07-18T15:40:00Z
```

За один запуск публикуется одна новость. Внутри проекта соблюдается порядок версий, между проектами — FIFO по `queued_at`. Ошибка раннего патчноута блокирует только следующие версии того же проекта. Приватные репозитории не сканируются.

Единый план интеграции для ИИ и программиста находится в [UNEWS.md](UNEWS.md), архитектура — в [docs/QUEUE_ARCHITECTURE.md](docs/QUEUE_ARCHITECTURE.md).

## 30. Экономное расписание v0.3.2

Плановая проверка выполняется раз в четыре часа на 7-й минуте (`7 */4 * * *`). Для срочной новости запустить `Publish all project news` вручную с `dry_run=false`.
## Russian publication and repair rule

For Anton's project news, write Telegram-facing content in Russian by default. English technical words are allowed only as short terms, for example `OCR`, `WebApp`, `runtime`, `Settings`, and `Food Log`.

For `project: uSugar`:

- use the public style `uSugar / тыСахар`;
- include `version`, `repo_url` or `web_url`, `image`, and `image_text`;
- make the caption/body Russian;
- make the Telegram card Russian or text-light, never English-only;
- do not allow `????`, `???`, `�`, mojibake, private Telegram identifiers, medical values, `.env`, tokens, or ngrok links;
- keep the footer `#uSugar #тыСахар #uNews #Sunpole`.

Existing Telegram posts must not be repaired by publishing duplicates. If `data/published.json` contains `message_ids`, repair the original post with:

```bash
npm run edit:media -- -- --message-id <id> --patchnote <path> --key <published-key> --record-state
```

If Telegram refuses media replacement, repair only the caption with `npm run edit:caption` and report that the old image remains historical.
