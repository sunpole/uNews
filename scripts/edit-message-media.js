#!/usr/bin/env node

import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { assertPublicationPolicy, buildPostUrl } from "./patchnote-policy.js";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--message-id") args.messageId = argv[++index];
    else if (arg === "--patchnote") args.patchnote = argv[++index];
    else if (arg === "--key") args.key = argv[++index];
    else if (arg === "--record-state") args.recordState = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printUsage() {
  console.log(`Usage:
  npm run edit:media -- -- --message-id 14 --patchnote <path-to-news.md> [--key <published-key>] [--record-state]
  node scripts/edit-message-media.js --message-id 14 --patchnote <path-to-news.md> [--key <published-key>] [--record-state]`);
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
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parsePatchnote(source, filePath) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error(`Patchnote has no YAML front matter: ${filePath}`);
  return { frontMatter: parseSimpleYaml(match[1]), body: match[2].trim() };
}

function parseSimpleYaml(yamlSource) {
  const result = {};
  let currentArrayKey = null;
  for (const rawLine of yamlSource.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const item = rawLine.match(/^\s*-\s*(.+?)\s*$/);
    if (item && currentArrayKey) {
      result[currentArrayKey].push(stripQuotes(item[1].trim()));
      continue;
    }
    const kv = rawLine.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!kv) {
      currentArrayKey = null;
      continue;
    }
    const key = kv[1];
    const value = (kv[2] || "").trim();
    if (!value) {
      result[key] = [];
      currentArrayKey = key;
    } else {
      result[key] = stripQuotes(value);
      currentArrayKey = null;
    }
  }
  return result;
}

async function editMessageMedia({ token, chatId, messageId, imagePath, caption }) {
  const image = await readFile(imagePath);
  const media = {
    type: "photo",
    media: "attach://photo",
    caption,
  };

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("message_id", String(messageId));
  form.append("media", JSON.stringify(media));
  form.append("photo", new Blob([image], { type: "image/png" }), path.basename(imagePath));

  const response = await fetch(`https://api.telegram.org/bot${token}/editMessageMedia`, {
    method: "POST",
    body: form,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const description = payload?.description || response.statusText;
    throw new Error(`Telegram editMessageMedia failed: ${description}`);
  }
  return payload;
}

async function updatePublishedDetails({ key, method, messageId, postUrl }) {
  const statePath = "data/published.json";
  const state = JSON.parse(await readFile(statePath, "utf8"));
  state.details = state.details && typeof state.details === "object" ? state.details : {};
  state.details[key] = {
    method,
    message_ids: [Number(messageId)],
    post_url: postUrl,
    published_at: state.details[key]?.published_at || null,
    caption_edited_at: new Date().toISOString(),
    media_edited_at: new Date().toISOString(),
  };
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.messageId || !args.patchnote) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  await loadLocalEnv();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (!token || !chatId) throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID are required.");

  const markdownPath = path.resolve(args.patchnote);
  const markdown = await readFile(markdownPath, "utf8");
  const { frontMatter, body } = parsePatchnote(markdown, markdownPath);
  const policy = assertPublicationPolicy({ frontMatter, body, label: markdownPath });
  if (policy.imageNames.length !== 1) {
    throw new Error(`edit:media requires exactly one image, got ${policy.imageNames.length}.`);
  }

  const imagePath = path.resolve(path.dirname(markdownPath), policy.imageNames[0]);
  await access(imagePath);

  await editMessageMedia({
    token,
    chatId,
    messageId: args.messageId,
    imagePath,
    caption: policy.captionText,
  });

  const postUrl = buildPostUrl(chatId, args.messageId);
  if (args.recordState && args.key) {
    await updatePublishedDetails({
      key: args.key,
      method: "sendPhoto",
      messageId: args.messageId,
      postUrl,
    });
  }

  console.log(`Edited message media: ${postUrl || args.messageId}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
