#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { assertPublicationPolicy } from "./patchnote-policy.js";
import { parsePatchnote } from "./lib/front-matter.js";

function parseArgs(argv) {
  const args = { apply: false, sourceRoot: null, repository: null, from: null, to: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--source-root") args.sourceRoot = argv[++index];
    else if (arg === "--repository") args.repository = argv[++index];
    else if (arg === "--from-message") args.from = Number(argv[++index]);
    else if (arg === "--to-message") args.to = Number(argv[++index]);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printUsage() {
  console.log(`Usage:
  node scripts/repair-legacy-captions.js --source-root <private-source-repo> --repository <owner/repo> --from-message <id> --to-message <id> [--apply]

Without --apply the command is read-only. It only supports a source that ends
with a terminal manual Telegram footer: one URL and one multi-tag line.`);
}

async function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  try {
    const content = await readFile(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const equals = line.indexOf("=");
      if (equals < 0) continue;
      const key = line.slice(0, equals).trim();
      const value = line.slice(equals + 1).trim().replace(/^(?:"|')|(?:"|')$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function gitShowLatestPath(sourceRoot, filePath) {
  const log = spawnSync("git", ["-C", sourceRoot, "log", "--all", "--format=%H", "--", filePath], { encoding: "utf8" });
  if (log.status !== 0) throw new Error(`Cannot read Git history for ${filePath}.`);
  const revision = log.stdout.split(/\r?\n/).find(Boolean);
  if (!revision) throw new Error(`No Git revision contains ${filePath}.`);
  const show = spawnSync("git", ["-C", sourceRoot, "show", `${revision}:${filePath}`], { encoding: "utf8" });
  if (show.status !== 0) throw new Error(`Cannot read ${filePath} from ${revision}.`);
  return show.stdout;
}

function stripTerminalLegacyFooter(body) {
  const footer = /(?:\r?\n){2}(?:(?:\u0421\u0441\u044b\u043b\u043a\u0430|Link):\s*https?:\/\/[^\s]+\s*(?:\r?\n){2})?(?:\u0425\u044d\u0448\u0442\u0435\u0433\u0438:\s*)?(?:#[\p{L}\p{N}_-]+\s*){2,}$/u;
  const stripped = String(body || "").replace(footer, "").trim();
  if (stripped === String(body || "").trim()) {
    throw new Error("The source does not have the supported terminal manual Telegram footer.");
  }
  return stripped;
}

async function editCaption({ token, chatId, messageId, caption }) {
  const response = await fetch(`https://api.telegram.org/bot${token}/editMessageCaption`, {
    method: "POST",
    body: new URLSearchParams({ chat_id: chatId, message_id: String(messageId), caption }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(`Telegram editMessageCaption failed for ${messageId}: ${payload?.description || response.statusText}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.sourceRoot || !args.repository || !Number.isInteger(args.from) || !Number.isInteger(args.to)) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }
  if (args.from > args.to) throw new Error("--from-message cannot be greater than --to-message.");

  const statePath = "data/published.json";
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const prefix = `${args.repository}|`;
  const targets = Object.entries(state.details || {})
    .map(([key, value]) => ({ key, value, messageId: Number(value?.message_ids?.[0]) }))
    .filter((entry) => entry.key.startsWith(prefix) && entry.messageId >= args.from && entry.messageId <= args.to)
    .sort((left, right) => left.messageId - right.messageId);
  if (targets.length === 0) throw new Error("No published messages match the requested repository and range.");

  const repairs = targets.map((target) => {
    const filePath = target.key.split("|").slice(2).join("|");
    const { frontMatter, body } = parsePatchnote(gitShowLatestPath(args.sourceRoot, filePath), filePath);
    const policy = assertPublicationPolicy({ frontMatter, body: stripTerminalLegacyFooter(body), label: filePath });
    return { ...target, filePath, caption: policy.captionText };
  });

  if (!args.apply) {
    console.log(JSON.stringify({ mode: "check", repository: args.repository, repairs: repairs.map(({ messageId, filePath }) => ({ messageId, filePath })) }, null, 2));
    return;
  }

  await loadLocalEnv();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (!token || !chatId) throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID are required.");

  for (const repair of repairs) {
    await editCaption({ token, chatId, messageId: repair.messageId, caption: repair.caption });
    state.details[repair.key] = {
      ...state.details[repair.key],
      caption_edited_at: new Date().toISOString(),
      legacy_caption_repaired_at: new Date().toISOString(),
    };
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    console.log(`Repaired Telegram caption ${repair.messageId}: ${repair.filePath}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
