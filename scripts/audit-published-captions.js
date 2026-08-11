#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { parsePatchnote } from "./lib/front-matter.js";
import { getSourceTelegramText } from "./patchnote-policy.js";

const DETAILS_FLAG = "--details";

function parseArgs(argv) {
  if (argv.length === 0) return { details: false };
  if (argv.length === 1 && argv[0] === DETAILS_FLAG) return { details: true };
  throw new Error(`Usage: node scripts/audit-published-captions.js [${DETAILS_FLAG}]`);
}

function sourceUrl(key) {
  const [repository, branch, ...pathParts] = key.split("|");
  const filePath = pathParts.join("|");
  if (!repository || !branch || !filePath) throw new Error(`Invalid published key: ${key}`);
  return `https://raw.githubusercontent.com/${repository}/${branch}/${filePath}`;
}

function countMatches(text, expression) {
  return (text.match(expression) || []).length;
}

function classifyBody(body) {
  const cyrillic = countMatches(body, /[\u0400-\u04ff]/g);
  const latin = countMatches(body, /[A-Za-z]/g);
  const manualUrl = /https?:\/\/[^\s]+/iu.test(body);
  const manualHashtagFooter = /(?:^|\r?\n)\s*(?:#[\p{L}\p{N}_-]+\s*){2,}$/u.test(body);
  const likelyEnglish = cyrillic < 30 && latin >= 40 && latin > cyrillic * 2;

  return {
    manualUrl,
    manualHashtagFooter,
    likelyEnglish,
  };
}

async function auditEntry(key, details) {
  const source = details?.source || {};
  const url = sourceUrl(key);
  const response = await fetch(url);
  if (!response.ok) {
    if (source.legacy_caption_repaired_at) {
      return {
        messageIds: source.message_ids || [],
        key,
        status: "legacy-repaired",
        url,
        issues: [],
      };
    }
    return {
      messageIds: source.message_ids || [],
      key,
      status: `unavailable:${response.status}`,
      url,
      issues: ["source-unavailable"],
    };
  }

  const { frontMatter, body } = parsePatchnote(await response.text(), key);
  const issues = classifyBody(getSourceTelegramText(frontMatter, body));
  const labels = Object.entries(issues)
    .filter(([, present]) => present)
    .map(([label]) => label);

  return {
    messageIds: source.message_ids || [],
    key,
    status: "ok",
    url,
    issues: labels,
  };
}

async function main() {
  const { details } = parseArgs(process.argv.slice(2));
  const state = JSON.parse(await readFile("data/published.json", "utf8"));
  const entries = Object.entries(state.details || {});
  const results = await Promise.all(entries.map(([key, value]) => auditEntry(key, { source: value })));
  const affected = results.filter((entry) => entry.issues.length > 0);
  const summary = {
    scanned: results.length,
    clean: results.length - affected.length,
    manualFooter: results.filter((entry) => entry.issues.includes("manualUrl") || entry.issues.includes("manualHashtagFooter")).length,
    likelyEnglish: results.filter((entry) => entry.issues.includes("likelyEnglish")).length,
    sourceUnavailable: results.filter((entry) => entry.issues.includes("source-unavailable")).length,
  };

  console.log(JSON.stringify(details ? { summary, affected } : summary, null, 2));
  process.exitCode = affected.length > 0 ? 2 : 0;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
