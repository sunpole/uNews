#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { assertPublicationPolicy } from "./patchnote-policy.js";

const PORTAL_URL = "https://sunpole.github.io/uChurch-public/";
const REPOSITORY = "sunpole/uChurch";

const CAPTION_OVERRIDES = [
  [80, "17.11.21", "Обновление. uChurch присоединился к публичной ленте uNews. Здесь показывается развитие CRM на синтетических данных, без рабочей базы и личной информации."],
  [81, "17.11.22", "Патч. Добавлена безопасная основа для подключения отдельной локальной папки данных с проверкой пяти обязательных JSON до запуска CRM."],
  [82, "17.11.23", "Патч. Подключение внешних данных сделано управляемым: CRM не подменяет рабочую базу без явного выбора источника."],
  [83, "17.11.24", "Патч. Уточнена граница между публичной оболочкой CRM и локальными данными церкви: рабочие записи и резервные копии не публикуются."],
  [84, "17.11.25", "Патч. Подготовлено зашифрованное приватное восстановление для пользовательских данных без публикации ключей или содержимого базы."],
  [85, "17.11.26", "Обновление. Пользовательские данные вынесены за пределы публичного исходного проекта и подключаются только из локальной папки."],
  [86, "17.11.27", "Патч. Перед сохранением CRM теперь требует явно выбрать источник резервной копии, чтобы не перезаписать данные по умолчанию."],
  [87, "17.11.28", "Патч. Добавлена основа сессии данных: работа CRM отделена от исходной базы и подготовлена к безопасному сохранению новой версии."],
  [88, "17.11.29", "Обновление. CRM может открываться как пустая оболочка без автоматически подключенной рабочей базы."],
  [89, "17.11.30", "Патч. Рабочая копия базы выделена в отдельное пространство, чтобы изменения не накладывались на исходные данные."],
  [90, "17.11.31", "Обновление. Сохранение как новой версии базы стало отдельным контролируемым действием с понятным путём к результату."],
  [91, "17.11.32", "Обновление. Добавлена синтетическая Demo-база для безопасной проверки интерфейса и сценариев CRM без данных церкви."],
  [92, "17.11.33", "Патч. Demo-база открывается в отдельном рабочем пространстве, поэтому тестовые сохранения не меняют исходный шаблон."],
  [93, "17.11.34", "Обновление. Добавлена безопасная Корзина людей: архивирование сохраняет связи и требует подтверждения вместо безвозвратного удаления."],
  [94, "17.11.35", "Патч. Уточнён режим Demo workspace: пустая оболочка и тестовые данные запускаются раздельно и показывают состояние сессии."],
  [95, "17.11.36", "Патч. Локальный запуск CRM в Wi-Fi сети получил корректный адрес, чтобы безопасную Demo можно было открыть с другого устройства."],
  [96, "17.11.37", "Патч. На мобильных экранах метка активной Demo-сессии остаётся видимой и не перекрывает рабочий интерфейс."],
  [97, "17.11.38", "Патч. Таблица людей стала устойчивее на узких экранах: рабочие колонки сохраняют читаемость и горизонтальную прокрутку."],
  [98, "17.11.39", "Патч. Сенсорная и адаптивная раскладка CRM приведена в порядок для телефона, планшета и настольного браузера."],
  [99, "17.11.40", "Обновление. Для синтетической Demo-базы добавлена проверка покрытия сценариев, чтобы тесты затрагивали карточки, таблицу, роли и служения."],
  [100, "17.11.41", "Обновление. Добавлен Стартовый центр пустой оболочки: он объясняет выбор Тестовой, Новой или существующей базы без изменения данных сам по себе."],
];

function parseArgs(argv) {
  if (argv.length === 0) return { apply: false };
  if (argv.length === 1 && argv[0] === "--apply") return { apply: true };
  throw new Error("Usage: node scripts/repair-legacy-uchurch-captions.js [--apply]");
}

async function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  try {
    const content = await readFile(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const equals = line.indexOf("=");
      if (equals < 0) continue;
      const key = line.slice(0, equals).trim();
      const value = line.slice(equals + 1).trim().replace(/^(?:"|')|(?:"|')$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function buildPolicy(version, body) {
  return assertPublicationPolicy({
    frontMatter: {
      type: "patch",
      project: "uChurch",
      series: "uchurch",
      title: `uChurch v${version} historical caption repair`,
      version,
      queued_at: "2026-08-11T12:00:00Z",
      repo_url: `https://github.com/${REPOSITORY}`,
      web_url: PORTAL_URL,
      image: "archive.png",
    },
    body,
    label: `uChurch v${version}`,
  });
}

async function editCaption({ token, chatId, messageId, caption }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetch(`https://api.telegram.org/bot${token}/editMessageCaption`, {
        method: "POST",
        body: new URLSearchParams({ chat_id: chatId, message_id: String(messageId), caption }),
      });
    } catch (error) {
      if (attempt < 2) {
        console.log(`Telegram network error for ${messageId}; retrying once the connection settles.`);
        await delay(10_000);
        continue;
      }
      throw error;
    }
    const payload = await response.json().catch(() => null);
    const retryAfter = Number(payload?.parameters?.retry_after);
    if (response.ok && payload?.ok) return;
    if (response.status === 429 && Number.isFinite(retryAfter) && attempt < 2) {
      console.log(`Telegram rate limit for ${messageId}; retrying after ${retryAfter} seconds.`);
      await delay((retryAfter + 1) * 1000);
      continue;
    }
    throw new Error(`Telegram editMessageCaption failed for ${messageId}: ${payload?.description || response.statusText}`);
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const statePath = "data/published.json";
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const stateByMessage = new Map(
    Object.entries(state.details || {}).map(([key, value]) => [Number(value?.message_ids?.[0]), { key, value }]),
  );
  const repairs = CAPTION_OVERRIDES.map(([messageId, version, body]) => {
    const stateEntry = stateByMessage.get(messageId);
    if (!stateEntry || !stateEntry.key.startsWith(`${REPOSITORY}|`)) {
      throw new Error(`Published uChurch message ${messageId} is not available in data/published.json.`);
    }
    if (stateEntry.value.legacy_caption_repaired_at) return null;
    return { messageId, version, body, key: stateEntry.key, caption: buildPolicy(version, body).captionText };
  }).filter(Boolean);

  if (!apply) {
    console.log(JSON.stringify({ mode: "check", repairs: repairs.map(({ messageId, version }) => ({ messageId, version })) }, null, 2));
    return;
  }

  await loadLocalEnv();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (!token || !chatId) throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID are required.");

  for (const repair of repairs) {
    await editCaption({ token, chatId, messageId: repair.messageId, caption: repair.caption });
    state.details[repair.key] = {
      ...state.details[repair.key],
      caption_edited_at: new Date().toISOString(),
      legacy_caption_repaired_at: new Date().toISOString(),
    };
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    console.log(`Repaired Telegram caption ${repair.messageId}: uChurch v${repair.version}`);
    await delay(1100);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
