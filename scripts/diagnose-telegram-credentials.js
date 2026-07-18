#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const TELEGRAM_API = "https://api.telegram.org";
const TELEGRAM_RETRY_ATTEMPTS = 3;

async function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env");

  try {
    await access(envPath);
  } catch {
    return false;
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

  return true;
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

function present(value) {
  return value ? "present" : "missing";
}

function tokenFormat(token) {
  if (!token) return "missing";
  return /^\d+:[A-Za-z0-9_-]{20,}$/.test(token) ? "looks_like_telegram_token" : "unexpected_format";
}

function sanitizeError(error, token) {
  let message = error?.message || String(error);
  if (token) message = message.replaceAll(token, "[TOKEN]");
  message = message.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[TOKEN]");
  return message;
}

async function telegramJson(token, method, body = null) {
  const init = body
    ? {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }
    : { method: "GET" };

  const response = await fetchWithRetry(`${TELEGRAM_API}/bot${token}/${method}`, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const description = payload?.description || response.statusText || "Telegram request failed";
    const error = new Error(description);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function fetchWithRetry(url, init) {
  let lastError = null;
  for (let attempt = 1; attempt <= TELEGRAM_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (attempt < TELEGRAM_RETRY_ATTEMPTS) {
        await sleep(500 * attempt);
      }
    }
  }
  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const envFilePresent = await loadLocalEnv();
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const channelId = process.env.TELEGRAM_CHANNEL_ID || "";
  const botUsername = process.env.BOT_USERNAME || "";
  let failed = false;

  console.log(`env file: ${envFilePresent ? "present" : "missing"}`);
  console.log(`TELEGRAM_BOT_TOKEN: ${present(token)}`);
  console.log(`TELEGRAM_BOT_TOKEN format: ${tokenFormat(token)}`);
  console.log(`TELEGRAM_CHANNEL_ID: ${present(channelId)}`);
  console.log(`BOT_USERNAME: ${present(botUsername)}`);
  console.log(`channel target: ${channelId ? (channelId.startsWith("@") ? channelId : "configured") : "missing"}`);

  if (!token) {
    console.log("bot getMe: FAILED (missing TELEGRAM_BOT_TOKEN)");
    process.exit(1);
  }

  try {
    const getMe = await telegramJson(token, "getMe");
    const username = getMe.result?.username || "";
    console.log("bot getMe: OK");
    console.log(`bot username: ${username ? `@${username}` : "unknown"}`);

    if (botUsername) {
      const expected = botUsername.replace(/^@/, "");
      console.log(`BOT_USERNAME match: ${expected === username ? "yes" : "no"}`);
    }
  } catch (error) {
    failed = true;
    console.log(`bot getMe: FAILED${error.status ? ` (${error.status})` : ""}`);
    console.log(`bot getMe error: ${sanitizeError(error, token)}`);
  }

  if (channelId) {
    try {
      const chat = await telegramJson(token, "getChat", { chat_id: channelId });
      console.log("channel getChat: OK");
      console.log(`channel type: ${chat.result?.type || "unknown"}`);
      if (chat.result?.username) console.log(`channel username: @${chat.result.username}`);
    } catch (error) {
      failed = true;
      console.log(`channel getChat: FAILED${error.status ? ` (${error.status})` : ""}`);
      console.log(`channel getChat error: ${sanitizeError(error, token)}`);
    }
  } else {
    failed = true;
    console.log("channel getChat: FAILED (missing TELEGRAM_CHANNEL_ID)");
  }

  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(`diagnostics failed: ${sanitizeError(error, process.env.TELEGRAM_BOT_TOKEN || "")}`);
  process.exit(1);
});
