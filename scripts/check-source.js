#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(filePath);
    return entry.isFile() && entry.name.endsWith(".js") ? [filePath] : [];
  }));
  return nested.flat();
}

function requireSourceOrder(source, earlier, later, label) {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);
  if (earlierIndex < 0) throw new Error(`${label}: missing ${earlier}`);
  if (laterIndex < 0) throw new Error(`${label}: missing ${later}`);
  if (earlierIndex >= laterIndex) {
    throw new Error(`${label}: ${earlier} must appear before ${later}`);
  }
}

function requireIncludes(source, expected, label) {
  if (!source.includes(expected)) throw new Error(`${label}: missing ${expected}`);
}

function forbidIncludes(source, forbidden, label) {
  if (source.includes(forbidden)) throw new Error(`${label}: forbidden legacy source ${forbidden}`);
}

const files = await listJavaScriptFiles(path.resolve("scripts"));
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

const publisherWorkflowPath = path.resolve(".github/workflows/publish-all-news.yml");
const publisherWorkflow = await readFile(publisherWorkflowPath, "utf8");
const realPublisherCommand = "\n          npm run publish:all\n";
requireSourceOrder(
  publisherWorkflow,
  "- name: Configure checkpoint Git identity",
  "- name: Publish new patchnotes",
  "publish-all-news workflow",
);
requireSourceOrder(
  publisherWorkflow,
  'git config user.name "github-actions[bot]"',
  realPublisherCommand,
  "publish-all-news workflow",
);
requireSourceOrder(
  publisherWorkflow,
  'git config user.email "41898282+github-actions[bot]@users.noreply.github.com"',
  realPublisherCommand,
  "publish-all-news workflow",
);
requireIncludes(
  publisherWorkflow,
  'UNEWS_GIT_CHECKPOINT: "1"',
  "publish-all-news workflow",
);

const batchPublisher = await readFile(path.resolve("scripts/publish-all-news.js"), "utf8");
requireIncludes(
  batchPublisher,
  'import { fetchValidatedImage, validatedImageBlob } from "./lib/image-integrity.js";',
  "batch publisher",
);
requireIncludes(batchPublisher, "loadValidatedRemoteImages", "batch publisher");
requireIncludes(batchPublisher, "validatedImageBlob(validated)", "batch publisher");
requireSourceOrder(
  batchPublisher,
  "const auditedImages = await loadValidatedRemoteImages",
  "const batch = selectQueueBatch",
  "batch publisher queue audit",
);
requireSourceOrder(
  batchPublisher,
  "const validatedImages = await loadValidatedRemoteImages",
  "await publishToTelegram",
  "batch publisher pre-send validation",
);
forbidIncludes(batchPublisher, 'fetch(url, { method: "HEAD" })', "batch publisher");
forbidIncludes(batchPublisher, "assertRemoteImagesExist", "batch publisher");

const localPublisher = await readFile(path.resolve("scripts/publish-from-projects.js"), "utf8");
requireIncludes(
  localPublisher,
  'import { validateImageBytes, validatedImageBlob } from "./lib/image-integrity.js";',
  "local publisher",
);
requireIncludes(localPublisher, "loadValidatedLocalImages", "local publisher");
requireIncludes(localPublisher, "validatedImageBlob(validated)", "local publisher");
requireSourceOrder(
  localPublisher,
  "const validatedImages = await loadValidatedLocalImages",
  "await publishToTelegram",
  "local publisher image validation",
);

const imageIntegrity = await readFile(path.resolve("scripts/lib/image-integrity.js"), "utf8");
for (const required of [
  'fetchImpl(url, { method: "GET" })',
  "PNG CRC mismatch",
  "inflateSync",
  "PNG has trailing bytes after IEND",
  "extension declares",
]) {
  requireIncludes(imageIntegrity, required, "image integrity module");
}

console.log(
  `OK syntax: ${files.length} JavaScript files; `
  + "publisher identity, GET image audit, deep validation and Blob upload are guarded",
);
