#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import {
  assertPublicationPolicy,
  assertRealPublishAllowed,
  buildPostUrl,
  extractTelegramMessageIds,
} from "./patchnote-policy.js";
import { parsePatchnote, stripQuotes } from "./lib/front-matter.js";
import { cooldownRemainingMs, isSemanticVersion, parseQueuedAt, selectQueueBatch, selectQueueHead } from "./lib/queue.js";
import {
  buildHealthSnapshot,
  normalizePublishedState,
  writeJsonAtomic,
  writeJsonIfChanged,
  writeJsonIfChangedOrStale,
} from "./lib/state.js";
import { createGitHubClient } from "./lib/github-client.js";
import { checkpointPublishedState } from "./lib/git-checkpoint.js";
import { publishToTelegram } from "./lib/telegram-client.js";

const MAX_POSTS_PER_RUN = Math.max(1, Math.min(20, Number(process.env.UNEWS_MAX_POSTS_PER_RUN || 20)));
const TELEGRAM_POST_INTERVAL_MS = Math.max(61_000, Number(process.env.UNEWS_TELEGRAM_POST_INTERVAL_MS || 61_000));

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run") || argv.includes("--check") || process.env.UNEWS_DRY_RUN === "1",
  };
}

async function loadEnvFile(filePath = ".env") {
  try {
    const source = await readFile(filePath, "utf8");
    for (const rawLine of source.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = line.slice(0, separatorIndex).trim();
      const value = stripQuotes(line.slice(separatorIndex + 1).trim());
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function loadJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    throw new Error(`Cannot read valid JSON from ${filePath}: ${error.message}`);
  }
}

async function loadPatchnote(newsFile, github) {
  const markdown = await github.getText(newsFile.downloadUrl);
  if (markdown === null) throw new Error(`Patchnote download failed: ${newsFile.key}`);
  const parsed = parsePatchnote(markdown, newsFile.key);
  return { ...newsFile, markdown, ...parsed };
}

function resolveQueuedAt(patchnote) {
  const explicit = parseQueuedAt(patchnote.frontMatter.queued_at);
  if (!patchnote.frontMatter.queued_at) {
    throw new Error("Missing required field: queued_at");
  }
  if (!explicit) {
    throw new Error(`Invalid queued_at: ${patchnote.frontMatter.queued_at}`);
  }
  return { queuedAt: explicit, source: "front-matter" };
}

function imageDownloadUrl(newsFile, imageName) {
  const [owner, repo] = newsFile.project.repo.split("/");
  const branch = newsFile.project.branch || "main";
  const dir = path.posix.dirname(newsFile.path);
  const imagePath = `${dir}/${imageName}`;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${imagePath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

async function assertRemoteImagesExist(patchnote, imageNames) {
  for (const imageName of imageNames) {
    const url = imageDownloadUrl(patchnote, imageName);
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) throw new Error(`Image is not available (${response.status}): ${imageName}`);
  }
}

async function publishPatchnote(patchnote, { dryRun, token, chatId }) {
  const policy = assertPublicationPolicy({
    frontMatter: patchnote.frontMatter,
    body: patchnote.body,
    label: patchnote.key,
  });
  const mediaItems = policy.imageNames.map((name) => ({ name, url: imageDownloadUrl(patchnote, name) }));
  await assertRemoteImagesExist(patchnote, policy.imageNames);
  const method = mediaItems.length > 1 ? "sendMediaGroup" : mediaItems.length === 1 ? "sendPhoto" : "sendMessage";

  console.log(`${dryRun ? "Would publish" : "Publishing"}: ${patchnote.key} via ${method}`);
  console.log(
    JSON.stringify(
      {
        method,
        images: policy.imageNames,
        captionLength: policy.captionText.length,
        captionWasTruncated: policy.captionWasTruncated,
        link: policy.link,
        hashtags: policy.hashtags,
        captionPreview: policy.captionText,
      },
      null,
      2,
    ),
  );

  if (dryRun) return { method, published: false, messageIds: [], postUrl: null };

  const payload = await publishToTelegram({
    token,
    chatId,
    method,
    mediaItems,
    captionText: policy.captionText,
    messageText: policy.messageText,
  });

  const messageIds = extractTelegramMessageIds(payload);
  if (messageIds.length === 0) throw new Error(`Telegram ${method} returned no message_id; state was not marked published.`);
  return {
    method,
    published: true,
    messageIds,
    postUrl: buildPostUrl(chatId, messageIds[0]),
  };
}

async function main() {
  await loadEnvFile();
  const args = parseArgs(process.argv.slice(2));
  assertRealPublishAllowed({ dryRun: args.dryRun, commandName: "publish:all" });

  const config = await loadJson("projects.json");
  const statePath = "data/published.json";
  const state = normalizePublishedState(await loadJson(statePath));
  const publishedSet = new Set(state.published || []);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (!args.dryRun && (!token || !chatId)) throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID are required.");

  const github = createGitHubClient({ token: process.env.GITHUB_TOKEN || "" });
  const projects = await github.discoverPublicProjects(config);
  console.log(`Projects to scan: ${projects.length}`);

  const candidates = [];
  const scanErrors = [];
  for (const project of projects) {
    try {
      const files = await github.listNewsFiles(project);
      for (const file of files) if (!publishedSet.has(file.key)) candidates.push(file);
    } catch (error) {
      console.log(`Skip ${project.repo}: ${error.message}`);
      scanErrors.push({
        kind: "project-scan",
        project: project.repo,
        key: null,
        version: null,
        errors: [`Project scan failed: ${error.message}`],
      });
    }
  }

  const inspected = [];
  for (const file of candidates) {
    let patchnote = { ...file, frontMatter: {}, body: "" };
    let queuedAt = "9999-12-31T23:59:59.999Z";
    try {
      patchnote = await loadPatchnote(file, github);
      const queueTime = resolveQueuedAt(patchnote);
      queuedAt = queueTime.queuedAt;
      if (!isSemanticVersion(patchnote.frontMatter.version)) {
        throw new Error(`Invalid semantic version: ${patchnote.frontMatter.version || "missing"}`);
      }
      const policy = assertPublicationPolicy({ frontMatter: patchnote.frontMatter, body: patchnote.body, label: patchnote.key });
      await assertRemoteImagesExist(patchnote, policy.imageNames);
      inspected.push({ ...patchnote, queuedAt, queuedAtSource: queueTime.source, errors: [] });
    } catch (error) {
      inspected.push({ ...patchnote, queuedAt, queuedAtSource: "front-matter", errors: [error.message] });
    }
  }

  const batch = selectQueueBatch(inspected, MAX_POSTS_PER_RUN);
  const reportedErrors = [...scanErrors, ...batch.blocked];
  console.log(
    `New patchnotes found: ${candidates.length}. Ready in this batch: ${batch.selected.length}. Reported errors: ${reportedErrors.length}.`,
  );
  for (const blocked of reportedErrors) {
    console.error(`Blocked ${blocked.project}: ${blocked.key}: ${blocked.errors.join("; ")}`);
  }

  if (args.dryRun) {
    console.log(`Would publish ${batch.selected.length} item(s) in FIFO order (limit: ${MAX_POSTS_PER_RUN}).`);
    for (const patchnote of batch.selected) {
      await publishPatchnote(patchnote, { dryRun: true, token, chatId });
    }
    return;
  }

  let publishedCount = 0;
  if (batch.selected.length > 0) {
    const firstPause = cooldownRemainingMs(state.details, Date.now(), TELEGRAM_POST_INTERVAL_MS);
    if (firstPause > 0) {
      console.log(`Waiting ${firstPause} ms before the first Telegram post to respect the single-chat limit.`);
      await delay(firstPause);
    }
  }

  for (const patchnote of batch.selected) {
    if (publishedCount > 0) await delay(TELEGRAM_POST_INTERVAL_MS);
    console.log(`Batch item ${publishedCount + 1}/${batch.selected.length}: ${patchnote.key}.`);
    const result = await publishPatchnote(patchnote, { dryRun: false, token, chatId });
    const publishedAt = new Date().toISOString();
    publishedSet.add(patchnote.key);
    state.published = [...publishedSet].sort();
    state.details[patchnote.key] = {
      method: result.method,
      message_ids: result.messageIds,
      post_url: result.postUrl,
      queued_at: patchnote.queuedAt,
      published_at: publishedAt,
    };
    await writeJsonAtomic(statePath, state);
    checkpointPublishedState(patchnote.key);
    publishedCount += 1;
    console.log(`Immediately recorded published state: ${patchnote.key}.`);
  }

  const remainingItems = inspected.filter((item) => !publishedSet.has(item.key));
  const remainingQueue = selectQueueHead(remainingItems);
  const checkedAt = new Date().toISOString();
  const health = buildHealthSnapshot({
    checkedAt,
    pendingCount: Math.max(0, candidates.length - publishedCount),
    readyCount: remainingQueue.readyHeads.length,
    blockedCount: reportedErrors.length,
    selectedKey: remainingQueue.selected?.key || null,
    dryRun: false,
  });
  await writeJsonIfChangedOrStale("data/health.json", health, {
    ignoredKeys: ["last_successful_check_at"],
    timestampKey: "last_successful_check_at",
    maxAgeMs: 24 * 60 * 60 * 1000,
  });
  await writeJsonIfChanged("data/errors.json", { schema: 1, updated_at: checkedAt, errors: reportedErrors }, ["updated_at"]);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
