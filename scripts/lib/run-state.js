import { readFile } from "node:fs/promises";

import { writeJsonAtomic } from "./state.js";

const MAX_ERROR_LENGTH = 600;

async function loadJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export function sanitizeFailureMessage(message, secretValues = []) {
  let safe = String(message || "Unknown uNews publisher failure");
  for (const secret of secretValues) {
    if (secret) safe = safe.replaceAll(String(secret), "[REDACTED]");
  }
  safe = safe
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[REDACTED]")
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim();
  return (safe || "Unknown uNews publisher failure").slice(0, MAX_ERROR_LENGTH);
}

export function buildFailureHealthSnapshot(previous, { checkedAt, message, mode = "publish" }) {
  return {
    schema: 1,
    last_successful_check_at: previous?.last_successful_check_at || null,
    last_attempt_at: checkedAt,
    last_attempt_status: "failed",
    pending_count: Number.isInteger(previous?.pending_count) ? previous.pending_count : null,
    ready_project_count: Number.isInteger(previous?.ready_project_count) ? previous.ready_project_count : null,
    error_count: Math.max(1, Number(previous?.error_count) || 0),
    selected_key: previous?.selected_key || null,
    mode,
    last_error: message,
  };
}

export async function recordFatalRun({
  message,
  checkedAt = new Date().toISOString(),
  mode = "publish",
  healthPath = "data/health.json",
  errorsPath = "data/errors.json",
  secretValues = [],
} = {}) {
  const safeMessage = sanitizeFailureMessage(message, secretValues);
  const previousHealth = await loadJsonSafe(healthPath, {});
  const health = buildFailureHealthSnapshot(previousHealth, {
    checkedAt,
    message: safeMessage,
    mode,
  });
  const errors = {
    schema: 1,
    updated_at: checkedAt,
    errors: [
      {
        kind: "fatal-run",
        project: null,
        key: null,
        version: null,
        errors: [safeMessage],
      },
    ],
  };

  await writeJsonAtomic(healthPath, health);
  await writeJsonAtomic(errorsPath, errors);
  return { health, errors };
}
