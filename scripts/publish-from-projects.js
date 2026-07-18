#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  assertPublicationPolicy,
  assertRealPublishAllowed,
  buildPostUrl,
  extractTelegramMessageIds,
} from "./patchnote-policy.js";
import { parsePatchnote } from "./lib/front-matter.js";
import { publishToTelegram } from "./lib/telegram-client.js";

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
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    const value = stripQuotes(line.slice(equalsIndex + 1).trim());
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
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

  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/png";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.filePath) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  await loadLocalEnv();
  assertRealPublishAllowed({ dryRun: args.dryRun, commandName: "publish:projects" });

  const markdownPath = path.resolve(args.filePath);
  const markdown = await readFile(markdownPath, "utf8");
  const { frontMatter, body } = parsePatchnote(markdown, markdownPath);
  const policy = assertPublicationPolicy({ frontMatter, body, label: markdownPath });
  const imagePaths = resolveImagePaths(markdownPath, policy.imageNames);
  await assertFilesExist(imagePaths);

  const method = imagePaths.length > 1 ? "sendMediaGroup" : imagePaths.length === 1 ? "sendPhoto" : "sendMessage";

  const summary = {
    method,
    patchnote: markdownPath,
    images: policy.imageNames,
    captionLength: policy.captionText.length,
    captionWasTruncated: policy.captionWasTruncated,
    messageLength: policy.messageText.length,
    messageWasTruncated: policy.messageWasTruncated,
    link: policy.link,
    hashtags: policy.hashtags,
    captionPreview: policy.captionText,
  };

  if (args.dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID are required unless --dry-run is used.");
  }

  const mediaItems = imagePaths.map((imagePath) => ({
    name: path.basename(imagePath),
    loadBlob: () => createFileBlob(imagePath),
  }));
  const payload = await publishToTelegram({
    token,
    chatId,
    method,
    mediaItems,
    captionText: policy.captionText,
    messageText: policy.messageText,
  });

  const messageIds = extractTelegramMessageIds(payload);
  console.log(
    JSON.stringify(
      {
        ...summary,
        published: true,
        messageIds,
        postUrl: buildPostUrl(chatId, messageIds[0]),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
