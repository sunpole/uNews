#!/usr/bin/env node

import process from "node:process";

import { recordFatalRun, sanitizeFailureMessage } from "./lib/run-state.js";

const message = sanitizeFailureMessage(
  process.argv.slice(2).join(" ") || "uNews workflow preflight failed",
  [process.env.TELEGRAM_BOT_TOKEN, process.env.GITHUB_TOKEN],
);

recordFatalRun({
  message,
  secretValues: [process.env.TELEGRAM_BOT_TOKEN, process.env.GITHUB_TOKEN],
}).then(() => {
  console.error(`Recorded workflow failure: ${message}`);
}).catch((error) => {
  console.error(`Could not record workflow failure: ${sanitizeFailureMessage(error.message)}`);
  process.exitCode = 1;
});
