#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

import { recordFatalRun, sanitizeFailureMessage } from "./lib/run-state.js";

const MAX_CAPTURED_OUTPUT = 64_000;

function isDryRun(args) {
  return args.includes("--dry-run")
    || args.includes("--check")
    || process.env.UNEWS_DRY_RUN === "1";
}

function appendLimited(current, chunk) {
  const next = `${current}${chunk}`;
  return next.length <= MAX_CAPTURED_OUTPUT
    ? next
    : next.slice(next.length - MAX_CAPTURED_OUTPUT);
}

function lastUsefulLine(output) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) || "uNews publisher exited without an error message";
}

async function run() {
  const args = process.argv.slice(2);
  const dryRun = isDryRun(args);
  const child = spawn(process.execPath, ["scripts/publish-all-news.js", ...args], {
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  let captured = "";
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    captured = appendLimited(captured, chunk.toString("utf8"));
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    captured = appendLimited(captured, chunk.toString("utf8"));
  });

  const exitCode = await new Promise((resolve) => {
    child.once("error", (error) => {
      captured = appendLimited(captured, `\n${error.message}\n`);
      resolve(1);
    });
    child.once("close", (code) => resolve(Number.isInteger(code) ? code : 1));
  });

  if (exitCode !== 0 && !dryRun) {
    const message = sanitizeFailureMessage(lastUsefulLine(captured), [
      process.env.TELEGRAM_BOT_TOKEN,
      process.env.GITHUB_TOKEN,
    ]);
    try {
      await recordFatalRun({
        message,
        secretValues: [process.env.TELEGRAM_BOT_TOKEN, process.env.GITHUB_TOKEN],
      });
      console.error("Fatal publisher state was written to data/health.json and data/errors.json.");
    } catch (stateError) {
      console.error(`Failed to persist fatal publisher state: ${sanitizeFailureMessage(stateError.message)}`);
    }
  }

  process.exitCode = exitCode;
}

run().catch(async (error) => {
  const dryRun = isDryRun(process.argv.slice(2));
  const message = sanitizeFailureMessage(error?.message || String(error), [
    process.env.TELEGRAM_BOT_TOKEN,
    process.env.GITHUB_TOKEN,
  ]);
  console.error(message);
  if (!dryRun) {
    try {
      await recordFatalRun({
        message,
        secretValues: [process.env.TELEGRAM_BOT_TOKEN, process.env.GITHUB_TOKEN],
      });
    } catch (stateError) {
      console.error(`Failed to persist fatal publisher state: ${sanitizeFailureMessage(stateError.message)}`);
    }
  }
  process.exitCode = 1;
});
