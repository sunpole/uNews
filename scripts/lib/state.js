import { readFile, rename, writeFile } from "node:fs/promises";

export function normalizePublishedState(state) {
  if (!state || !Array.isArray(state.published) || !state.details || typeof state.details !== "object" || Array.isArray(state.details)) {
    throw new Error("Invalid data/published.json structure; publishing stopped to prevent duplicates.");
  }
  if (state.published.some((key) => typeof key !== "string") || new Set(state.published).size !== state.published.length) {
    throw new Error("Invalid data/published.json keys; publishing stopped to prevent duplicates.");
  }
  return {
    published: state.published,
    details: state.details,
  };
}

export async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

export async function writeJsonIfChanged(filePath, value, ignoredKeys = []) {
  let current = null;
  try {
    current = JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    // A missing or invalid state file must be replaced.
  }
  const comparable = (input) => {
    const copy = input ? structuredClone(input) : input;
    for (const key of ignoredKeys) if (copy && typeof copy === "object") delete copy[key];
    return JSON.stringify(copy);
  };
  if (comparable(current) === comparable(value)) return false;
  await writeJsonAtomic(filePath, value);
  return true;
}

export async function writeJsonIfChangedOrStale(
  filePath,
  value,
  { ignoredKeys = [], timestampKey, maxAgeMs, now = Date.now() },
) {
  let current = null;
  try {
    current = JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    await writeJsonAtomic(filePath, value);
    return true;
  }

  const comparable = (input) => {
    const copy = structuredClone(input);
    for (const key of ignoredKeys) delete copy[key];
    return JSON.stringify(copy);
  };
  const lastTimestamp = Date.parse(current[timestampKey] || "");
  const isStale = !Number.isFinite(lastTimestamp) || now - lastTimestamp >= maxAgeMs;
  if (comparable(current) === comparable(value) && !isStale) return false;
  await writeJsonAtomic(filePath, value);
  return true;
}

export function buildHealthSnapshot({ checkedAt, pendingCount, readyCount, blockedCount, selectedKey, dryRun }) {
  return {
    schema: 1,
    last_successful_check_at: checkedAt,
    last_attempt_at: checkedAt,
    last_attempt_status: "success",
    pending_count: pendingCount,
    ready_project_count: readyCount,
    error_count: blockedCount,
    selected_key: selectedKey || null,
    mode: dryRun ? "dry-run" : "publish",
    last_error: null,
  };
}

export function selectedKeyAfterRun(selectedKey, publishedThisRun) {
  return publishedThisRun ? null : selectedKey || null;
}
