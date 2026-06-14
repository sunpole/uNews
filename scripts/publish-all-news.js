#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const OWNER_API = "https://api.github.com";
const TELEGRAM_CAPTION_LIMIT = 1024;
const TELEGRAM_MESSAGE_LIMIT = 4096;
const MAX_POSTS_PER_RUN = Number(process.env.UNEWS_MAX_POSTS_PER_RUN || 10);

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

function parsePatchnote(source, label) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error(`Patchnote has no YAML front matter: ${label}`);
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

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function getImageNames(frontMatter) {
  if (Array.isArray(frontMatter.images) && frontMatter.images.length > 0) return frontMatter.images.filter(Boolean);
  if (frontMatter.image) return [frontMatter.image];
  return [];
}

function getTelegramText(frontMatter, body) {
  const shortTextMatch = body.match(/(?:^|\r?\n)(?:#{1,6}\s*)?Короткий текст для Telegram:\s*\r?\n([\s\S]*)$/i);
  const text = shortTextMatch ? shortTextMatch[1] : body;
  return text.trim() || frontMatter.title || "uNews";
}

function limitTelegramText(text, limit) {
  const suffix = "\n\n...\nПолный текст см. в патчноуте.";
  if (text.length <= limit) return { text, truncated: false };
  const usableLength = Math.max(0, limit - suffix.length);
  return { text: `${text.slice(0, usableLength).trimEnd()}${suffix}`, truncated: true };
}

function githubHeaders() {
  const headers = {
    "Accept": "application/vnd.github+json",
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
      projects.push({ name: repo.name, repo: fullName, branch: repo.default_branch || config.defaultBranchFallback || "main", newsDir: config.newsDir || "news" });
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
    .map((entry) => ({ project, name: entry.name, path: entry.path, downloadUrl: entry.download_url, key: `${project.repo}|${branch}|${entry.path}` }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function loadPatchnote(newsFile) {
  const markdown = await githubGetText(newsFile.downloadUrl);
  const parsed = parsePatchnote(markdown, newsFile.key);
  return { ...newsFile, markdown, ...parsed };
}

function imageDownloadUrl(newsFile, imageName) {
  const [owner, repo] = newsFile.project.repo.split("/");
  const branch = newsFile.project.branch || "main";
  const dir = path.posix.dirname(newsFile.path);
  const imagePath = `${dir}/${imageName}`;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${imagePath.split("/").map(encodeURIComponent).join("/")}`;
}

async function fetchImageBlob(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed ${response.status}: ${url}`);
  return new Blob([await response.arrayBuffer()], { type: response.headers.get("content-type") || "image/png" });
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
  const imageNames = getImageNames(patchnote.frontMatter);
  const telegramText = getTelegramText(patchnote.frontMatter, patchnote.body);
  const caption = limitTelegramText(telegramText, TELEGRAM_CAPTION_LIMIT);
  const message = limitTelegramText(telegramText, TELEGRAM_MESSAGE_LIMIT);
  const mediaItems = imageNames.map((name) => ({ name, url: imageDownloadUrl(patchnote, name) }));
  const method = mediaItems.length > 1 ? "sendMediaGroup" : mediaItems.length === 1 ? "sendPhoto" : "sendMessage";

  console.log(`${dryRun ? "Would publish" : "Publishing"}: ${patchnote.key} via ${method}`);
  if (dryRun) return { method, published: false };

  if (method === "sendMediaGroup") await sendMediaGroup({ token, chatId, mediaItems, caption: caption.text });
  else if (method === "sendPhoto") await sendPhoto({ token, chatId, imageUrl: mediaItems[0].url, imageName: mediaItems[0].name, caption: caption.text });
  else await sendMessage({ token, chatId, text: message.text });

  return { method, published: true };
}

async function main() {
  await loadEnvFile();
  const args = parseArgs(process.argv.slice(2));
  const config = await loadJson("projects.json", { owner: "sunpole", newsDir: "news", exclude: ["sunpole/uNews"] });
  const statePath = "data/published.json";
  const state = await loadJson(statePath, { published: [] });
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

  candidates.sort((a, b) => a.key.localeCompare(b.key));
  const toPublish = candidates.slice(0, MAX_POSTS_PER_RUN);
  console.log(`New patchnotes found: ${candidates.length}. This run limit: ${toPublish.length}.`);

  const newlyPublished = [];
  for (const file of toPublish) {
    const patchnote = await loadPatchnote(file);
    const result = await publishPatchnote(patchnote, { dryRun: args.dryRun, token, chatId });
    if (result.published) newlyPublished.push(file.key);
  }

  if (!args.dryRun && newlyPublished.length > 0) {
    state.published = [...publishedSet, ...newlyPublished].sort();
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    console.log(`Updated ${statePath}: ${newlyPublished.length} new entries.`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
