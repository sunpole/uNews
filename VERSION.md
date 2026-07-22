# uNews 0.3.6

Текущая версия: `0.3.6` — Git identity настраивается до первого per-post checkpoint.

## Что исправлено

- Workflow выполняет шаг `Configure checkpoint Git identity` до `npm run publish:all`.
- `github-actions[bot]` name и email доступны внутреннему `checkpointPublishedState()` уже при первом Telegram-посте.
- После каждого `sendPhoto`, `sendMessage` или `sendMediaGroup` индивидуальный commit `Record published uNews item: ...` снова может быть создан немедленно.
- `scripts/check-source.js` проверяет, что identity-step и обе команды `git config` находятся раньше publisher-step.
- `UNEWS_GIT_CHECKPOINT=1` остаётся обязательным и проверяется тестом исходников.
- Поздний fallback `Commit queue state` сохранён как дополнительная защита, но больше не заменяет обычный per-post checkpoint.

## Проверенный инцидент

После исправления повреждённого изображения uDream Telegram успешно принял патчноут `23.8.0`:

```text
message_id: 54
post_url: https://t.me/uNewsLog/54
published_at: 2026-07-22T09:59:22.164Z
```

Затем внутренний checkpoint попытался выполнить `git commit`, но Git identity ещё не была настроена. Recovery-layer `0.3.5` сохранил точную ошибку и fallback-step записал `published.json`, поэтому message `54` не потерян и повторно публиковаться не будет.

Версия `0.3.6` исправляет порядок шагов, не меняя FIFO, Telegram-клиент, policy или формат состояния.

## Не изменено

- строгий FIFO и порядок версий внутри проекта;
- максимум 20 публикаций за запуск;
- пауза не менее 61 секунды;
- немедленный checkpoint после каждого успешного Telegram-поста;
- recovery-state `0.3.5` и редактирование секретов;
- GitHub-first публикация и запрет реальной локальной отправки;
- maintenance-команды для уже опубликованных постов.

## Точки восстановления

Предыдущее стабильное состояние до автоматизации сохранено в ветках:

```text
stable/manual-publishing-v0.1.0
release/v0.1.0-stable-manual
```

Автоматический workflow работает только из `main`. Версия `0.3.5` остаётся предыдущим recovery-baseline; `0.3.6` добавляет обязательную Git identity до publisher-step.
