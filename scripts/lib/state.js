import { readFile, rename, writeFile } from "node:fs/promises";

export function normalizePublishedState(state) {
  return {
    published: Array.isArray(state?.published) ? state.published : [],
    details: state?.details && typeof state.details === "object" ? state.details : {},
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

export function buildHealthSnapshot({ checkedAt, pendingCount, readyCount, blockedCount, selectedKey, dryRun }) {
  return {
    schema: 1,
    last_successful_check_at: checkedAt,
    pending_count: pendingCount,
    ready_project_count: readyCount,
    error_count: blockedCount,
    selected_key: selectedKey || null,
    mode: dryRun ? "dry-run" : "publish",
  };
}
