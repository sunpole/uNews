#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  assertPublicationPolicy,
  assertRealPublishAllowed,
  buildPostUrl,
  extractTelegramMessageIds,
} from "./patchnote-policy.js";
import { parsePatchnote, stripQuotes } from "./lib/front-matter.js";
import { parseQueuedAt, selectQueueHead } from "./lib/queue.js";
import { buildHealthSnapshot, normalizePublishedState, writeJsonAtomic, writeJsonIfChanged } from "./lib/state.js";

const OWNER_API = "https://api.github.com";

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
  } catch {
    return fallback;
  }
}

function githubHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "uNews-publisher",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function githubGetJson(url) {
  const response = await fetch(url, { headers: githubHeaders() });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub request failed ${response.status}: ${url}`);
  return response.json();
}

async function githubGetText(url) {
  const response = await fetch(url, { headers: githubHeaders() });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub text request failed ${response.status}: ${url}`);
  return response.text();
}

async function discoverProjects(config) {
  const projects = [];
  const seen = new Set();

  for (const project of config.manualProjects || []) {
    projects.push(project);
    seen.add(project.repo);
  }

  const owner = config.owner || "sunpole";
  const exclude = new Set(config.exclude || []);
  let page = 1;
  while (true) {
    const repos = await githubGetJson(`${OWNER_API}/users/${owner}/repos?per_page=100&page=${page}&sort=updated`);
    if (!repos || repos.length === 0) break;
    for (const repo of repos) {
      const fullName = repo.full_name;
      if (exclude.has(fullName) || seen.has(fullName) || repo.archived) continue;
      projects.push({
        name: repo.name,
        repo: fullName,
        branch: repo.default_branch || config.defaultBranchFallback || "main",
        newsDir: config.newsDir || "news",
      });
      seen.add(fullName);
    }
    page += 1;
  }
  return projects;
}

async function listNewsFiles(project) {
  const [owner, repo] = project.repo.split("/");
  const branch = project.branch || "main";
  const newsDir = project.newsDir || "news";
  const url = `${OWNER_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(newsDir)}?ref=${encodeURIComponent(branch)}`;
  const entries = await githubGetJson(url);
  if (!entries || !Array.isArray(entries)) return [];
  return entries
    .filter((entry) => entry.type === "file" && entry.name.endsWith(".md"))
    .map((entry) => ({
      project,
      name: entry.name,
      path: entry.path,
      downloadUrl: entry.download_url,
      key: `${project.repo}|${branch}|${entry.path}`,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function loadPatchnote(newsFile) {
  const markdown = await githubGetText(newsFile.downloadUrl);
  if (markdown === null) throw new Error(`Patchnote download failed: ${newsFile.key}`);
  const parsed = parsePatchnote(markdown, newsFile.key);
  return { ...newsFile, markdown, ...parsed };
}

async function resolveQueuedAt(patchnote) {
  const explicit = parseQueuedAt(patchnote.frontMatter.queued_at);
  if (patchnote.frontMatter.queued_at && !explicit) {
    throw new Error(`Invalid queued_at: ${patchnote.frontMatter.queued_at}`);
  }
  if (explicit) return { queuedAt: explicit, source: "front-matter" };

  const [owner, repo] = patchnote.project.repo.split("/");
  const branch = patchnote.project.branch || "main";
  const query = new URLSearchParams({ path: patchnote.path, sha: branch, per_page: "1" });
  const commits = await githubGetJson(`${OWNER_API}/repos/${owner}/${repo}/commits?${query}`);
  const fallback = parseQueuedAt(commits?.[0]?.commit?.committer?.date || commits?.[0]?.commit?.author?.date);
  if (!fallback) throw new Error("Missing queued_at and GitHub commit time fallback is unavailable.");
  return { queuedAt: fallback, source: "github-commit-fallback" };
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

async function fetchImageBlob(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed ${response.status}: ${url}`);
  return new Blob([await response.arrayBuffer()], { type: response.headers.get("content-type") || "image/png" });
}

async function assertRemoteImagesExist(patchnote, imageNames) {
  for (const imageName of imageNames) {
    const url = imageDownloadUrl(patchnote, imageName);
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) throw new Error(`Image is not available (${response.status}): ${imageName}`);
  }
}

async function sendMessage({ token, chatId, text }) {
  const body = new URLSearchParams({ chat_id: chatId, text, disable_web_page_preview: "false" });
  return telegramRequest(token, "sendMessage", body);
}

async function sendPhoto({ token, chatId, imageUrl, imageName, caption }) {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("photo", await fetchImageBlob(imageUrl), imageName);
  form.append("caption", caption);
  return telegramRequest(token, "sendPhoto", form);
}

async function sendMediaGroup({ token, chatId, mediaItems, caption }) {
  const form = new FormData();
  const media = mediaItems.map((item, index) => {
    const mediaItem = { type: "photo", media: `attach://photo${index}` };
    if (index === 0 && caption) mediaItem.caption = caption;
    return mediaItem;
  });
  form.append("chat_id", chatId);
  form.append("media", JSON.stringify(media));
  for (const [index, item] of mediaItems.entries()) {
    form.append(`photo${index}`, await fetchImageBlob(item.url), item.name);
  }
  return telegramRequest(token, "sendMediaGroup", form);
}

async function telegramRequest(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const description = payload?.description || response.statusText;
    throw new Error(`Telegram ${method} failed: ${description}`);
  }
  return payload;
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

  let payload;
  if (method === "sendMediaGroup") {
    payload = await sendMediaGroup({ token, chatId, mediaItems, caption: policy.captionText });
  } else if (method === "sendPhoto") {
    payload = await sendPhoto({ token, chatId, imageUrl: mediaItems[0].url, imageName: mediaItems[0].name, caption: policy.captionText });
  } else {
    payload = await sendMessage({ token, chatId, text: policy.messageText });
  }

  const messageIds = extractTelegramMessageIds(payload);
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

  const config = await loadJson("projects.json", { owner: "sunpole", newsDir: "news", exclude: ["sunpole/uNews"] });
  const statePath = "data/published.json";
  const state = normalizePublishedState(await loadJson(statePath, { published: [], details: {} }));
  const publishedSet = new Set(state.published || []);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (!args.dryRun && (!token || !chatId)) throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID are required.");

  const projects = await discoverProjects(config);
  console.log(`Projects to scan: ${projects.length}`);

  const candidates = [];
  for (const project of projects) {
    try {
      const files = await listNewsFiles(project);
      for (const file of files) if (!publishedSet.has(file.key)) candidates.push(file);
    } catch (error) {
      console.log(`Skip ${project.repo}: ${error.message}`);
    }
  }

  const inspected = [];
  for (const file of candidates) {
    try {
      const patchnote = await loadPatchnote(file);
      const queueTime = await resolveQueuedAt(patchnote);
      const policy = assertPublicationPolicy({ frontMatter: patchnote.frontMatter, body: patchnote.body, label: patchnote.key });
      await assertRemoteImagesExist(patchnote, policy.imageNames);
      inspected.push({ ...patchnote, queuedAt: queueTime.queuedAt, queuedAtSource: queueTime.source, errors: [] });
    } catch (error) {
      inspected.push({ ...file, frontMatter: {}, queuedAt: "9999-12-31T23:59:59.999Z", errors: [error.message] });
    }
  }

  const queue = selectQueueHead(inspected);
  console.log(`New patchnotes found: ${candidates.length}. Ready projects: ${queue.readyHeads.length}. Blocked projects: ${queue.blocked.length}.`);
  if (queue.selected) {
    console.log(`Queue head: ${queue.selected.key} (${queue.selected.queuedAt}, ${queue.selected.queuedAtSource}).`);
  }
  for (const blocked of queue.blocked) {
    console.error(`Blocked ${blocked.project}: ${blocked.key}: ${blocked.errors.join("; ")}`);
  }

  if (args.dryRun) {
    if (queue.selected) await publishPatchnote(queue.selected, { dryRun: true, token, chatId });
    return;
  }

  if (queue.selected) {
    const result = await publishPatchnote(queue.selected, { dryRun: false, token, chatId });
    const publishedAt = new Date().toISOString();
    publishedSet.add(queue.selected.key);
    state.published = [...publishedSet].sort();
    state.details[queue.selected.key] = {
      method: result.method,
      message_ids: result.messageIds,
      post_url: result.postUrl,
      queued_at: queue.selected.queuedAt,
      published_at: publishedAt,
    };
    await writeJsonAtomic(statePath, state);
    console.log(`Immediately recorded published state: ${queue.selected.key}.`);
  }

  const checkedAt = new Date().toISOString();
  const health = buildHealthSnapshot({
    checkedAt,
    pendingCount: candidates.length - (queue.selected ? 1 : 0),
    readyCount: Math.max(0, queue.readyHeads.length - (queue.selected ? 1 : 0)),
    blockedCount: queue.blocked.length,
    selectedKey: queue.selected?.key,
    dryRun: false,
  });
  await writeJsonIfChanged("data/health.json", health, ["last_successful_check_at"]);
  await writeJsonIfChanged("data/errors.json", { schema: 1, updated_at: checkedAt, errors: queue.blocked }, ["updated_at"]);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
