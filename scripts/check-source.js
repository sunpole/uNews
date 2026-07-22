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
if (!publisherWorkflow.includes('UNEWS_GIT_CHECKPOINT: "1"')) {
  throw new Error("publish-all-news workflow: Git checkpoint mode must remain enabled");
}

console.log(
  `OK syntax: ${files.length} JavaScript files; `
  + "publisher Git identity precedes checkpointed publication",
);
