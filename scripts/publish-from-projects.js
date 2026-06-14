#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const TELEGRAM_CAPTION_LIMIT = 1024;
const TELEGRAM_MESSAGE_LIMIT = 4096;

function printUsage() {
  console.log(`Usage:
  npm run publish:projects -- <path-to-news.md> [--check]
  node scripts/publish-from-projects.js <path-to-news.md> [--dry-run]

Environment:
  TELEGRAM_BOT_TOKEN   Telegram bot token
  TELEGRAM_CHANNEL_ID  Target chat/channel id
  UNEWS_DRY_RUN=1      Print payload summary without sending`);
}

function parseArgs(argv) {
  const args = {
    dryRun: process.env.UNEWS_DRY_RUN === "1",
    filePath: null,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    if (arg === "--dry-run" || arg === "--dryrun" || arg === "--check") {
      args.dryRun = true;
      continue;
    }

    if (!args.filePath) {
      args.filePath = arg;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

async function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env");

  try {
    await access(envPath);
  } catch {
    return;
  }

  const content = await readFile(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = stripQuotes(line.slice(equalsIndex + 1).trim());
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parsePatchnote(source, filePath) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`Patchnote has no YAML front matter: ${filePath}`);
  }

  return {
    frontMatter: parseSimpleYaml(match[1]),
    body: match[2].trim(),
  };
}

function parseSimpleYaml(yamlSource) {
  const result = {};
  let currentArrayKey = null;

  for (const rawLine of yamlSource.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) {
      continue;
    }

    const arrayItemMatch = rawLine.match(/^\s*-\s*(.+?)\s*$/);
    if (arrayItemMatch && currentArrayKey) {
      result[currentArrayKey].push(stripQuotes(arrayItemMatch[1].trim()));
      continue;
    }

    const keyValueMatch = rawLine.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!keyValueMatch) {
      currentArrayKey = null;
      continue;
    }

    const [, key, rawValue = ""] = keyValueMatch;
    const value = rawValue.trim();

    if (value === "") {
      result[key] = [];
      currentArrayKey = key;
      continue;
    }

    result[key] = stripQuotes(value);
    currentArrayKey = null;
  }

  return result;
}

function getImageNames(frontMatter) {
  if (Array.isArray(frontMatter.images) && frontMatter.images.length > 0) {
    return frontMatter.images.filter(Boolean);
  }

  if (frontMatter.image) {
    return [frontMatter.image];
  }

  return [];
}

function getTelegramText(frontMatter, body) {
  const shortTextMatch = body.match(
    /(?:^|\r?\n)(?:#{1,6}\s*)?Короткий текст для Telegram:\s*\r?\n([\s\S]*)$/i,
  );

  const text = shortTextMatch ? shortTextMatch[1] : body;
  return text.trim() || frontMatter.title || "uNews";
}

function limitTelegramText(text, limit, suffix) {
  if (text.length <= limit) {
    return { text, truncated: false };
  }

  const usableLength = Math.max(0, limit - suffix.length);
  return {
    text: `${text.slice(0, usableLength).trimEnd()}${suffix}`,
    truncated: true,
  };
}

async function assertFilesExist(filePaths) {
  for (const filePath of filePaths) {
    await access(filePath);
  }
}

function resolveImagePaths(markdownPath, imageNames) {
  const baseDir = path.dirname(markdownPath);
  return imageNames.map((imageName) => path.resolve(baseDir, imageName));
}

async function createFileBlob(filePath) {
  const bytes = await readFile(filePath);
  return new Blob([bytes], { type: getImageMimeType(filePath) });
}

function getImageMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  if (extension === ".gif") {
    return "image/gif";
  }

  return "image/png";
}

async function sendMessage({ token, chatId, text }) {
  const body = new URLSearchParams({
    chat_id: chatId,
    text,
    disable_web_page_preview: "false",
  });

  return telegramRequest(token, "sendMessage", body);
}

async function sendPhoto({ token, chatId, imagePath, caption }) {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("photo", await createFileBlob(imagePath), path.basename(imagePath));
  form.append("caption", caption);

  return telegramRequest(token, "sendPhoto", form);
}

async function sendMediaGroup({ token, chatId, imagePaths, caption }) {
  const form = new FormData();
  const media = imagePaths.map((imagePath, index) => {
    const mediaItem = {
      type: "photo",
      media: `attach://photo${index}`,
    };

    if (index === 0 && caption) {
      mediaItem.caption = caption;
    }

    return mediaItem;
  });

  form.append("chat_id", chatId);
  form.append("media", JSON.stringify(media));

  for (const [index, imagePath] of imagePaths.entries()) {
    form.append(`photo${index}`, await createFileBlob(imagePath), path.basename(imagePath));
  }

  return telegramRequest(token, "sendMediaGroup", form);
}

async function telegramRequest(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const description = payload?.description || response.statusText;
    throw new Error(`Telegram ${method} failed: ${description}`);
  }

  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.filePath) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  await loadLocalEnv();

  const markdownPath = path.resolve(args.filePath);
  const markdown = await readFile(markdownPath, "utf8");
  const { frontMatter, body } = parsePatchnote(markdown, markdownPath);
  const imageNames = getImageNames(frontMatter);
  const imagePaths = resolveImagePaths(markdownPath, imageNames);
  await assertFilesExist(imagePaths);

  const telegramText = getTelegramText(frontMatter, body);
  const captionResult = limitTelegramText(
    telegramText,
    TELEGRAM_CAPTION_LIMIT,
    "\n\n...\nПолный текст см. в патчноуте.",
  );
  const messageResult = limitTelegramText(
    telegramText,
    TELEGRAM_MESSAGE_LIMIT,
    "\n\n...\nПолный текст см. в патчноуте.",
  );

  const method =
    imagePaths.length > 1 ? "sendMediaGroup" : imagePaths.length === 1 ? "sendPhoto" : "sendMessage";

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          method,
          patchnote: markdownPath,
          images: imageNames,
          captionLength: captionResult.text.length,
          captionWasTruncated: captionResult.truncated,
          messageLength: messageResult.text.length,
          messageWasTruncated: messageResult.truncated,
        },
        null,
        2,
      ),
    );
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID are required unless --dry-run is used.");
  }

  if (imagePaths.length > 1) {
    await sendMediaGroup({ token, chatId, imagePaths, caption: captionResult.text });
  } else if (imagePaths.length === 1) {
    await sendPhoto({ token, chatId, imagePath: imagePaths[0], caption: captionResult.text });
  } else {
    await sendMessage({ token, chatId, text: messageResult.text });
  }

  console.log(`Published ${path.basename(markdownPath)} via ${method}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
