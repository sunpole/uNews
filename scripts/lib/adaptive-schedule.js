import { readFile, writeFile } from "node:fs/promises";

export const ADAPTIVE_SCHEDULES = Object.freeze({
  fast: "7,22,37,52 * * * *",
  "two-hour": "7 */2 * * *",
  "twelve-hour": "7 */12 * * *",
  daily: "7 7 * * *",
  "three-day": "7 7 */3 * *",
  weekly: "7 7 * * 1",
});

const HOUR_MS = 60 * 60 * 1000;
const MANAGED_CRON_RE = /(\s*# uNews adaptive schedule — managed by scripts\/lib\/adaptive-schedule\.js\r?\n\s*- cron: ")[^"]+("\s*)/;

export function normalizeSchedulerState(state) {
  if (
    !state ||
    state.schema !== 1 ||
    !Number.isFinite(Date.parse(state.last_activity_at || "")) ||
    !state.candidate_revisions ||
    typeof state.candidate_revisions !== "object" ||
    Array.isArray(state.candidate_revisions)
  ) {
    throw new Error("Invalid data/scheduler.json structure; adaptive scheduling stopped.");
  }
  return state;
}

export function selectAdaptiveTier(idleMs) {
  if (idleMs < HOUR_MS) return "fast";
  if (idleMs < 4 * HOUR_MS) return "two-hour";
  if (idleMs < 12 * HOUR_MS) return "twelve-hour";
  if (idleMs < 24 * HOUR_MS) return "daily";
  if (idleMs < 72 * HOUR_MS) return "three-day";
  return "weekly";
}

export function buildAdaptiveSchedule({ state, candidates, readyCount, now = Date.now(), forceWake = false }) {
  const current = normalizeSchedulerState(state);
  const candidateRevisions = Object.fromEntries(
    [...candidates]
      .map((candidate) => [candidate.key, candidate.revision || "unknown"])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const activityDetected =
    forceWake ||
    Object.entries(candidateRevisions).some(([key, revision]) => current.candidate_revisions[key] !== revision);
  const checkedAt = new Date(now).toISOString();
  const lastActivityAt = activityDetected ? checkedAt : current.last_activity_at;
  const idleMs = Math.max(0, now - Date.parse(lastActivityAt));
  const tier = readyCount > 0 ? "fast" : selectAdaptiveTier(idleMs);

  return {
    activityDetected,
    tierChanged: tier !== current.tier,
    cron: ADAPTIVE_SCHEDULES[tier],
    state: {
      schema: 1,
      tier,
      cron: ADAPTIVE_SCHEDULES[tier],
      last_activity_at: lastActivityAt,
      last_check_at: checkedAt,
      candidate_revisions: candidateRevisions,
    },
  };
}

export function replaceManagedCron(source, cron) {
  if (!Object.values(ADAPTIVE_SCHEDULES).includes(cron)) throw new Error(`Unsupported adaptive cron: ${cron}`);
  if (!MANAGED_CRON_RE.test(source)) throw new Error("Managed uNews cron marker is missing or duplicated.");
  const updated = source.replace(MANAGED_CRON_RE, `$1${cron}$2`);
  return { source: updated, changed: updated !== source };
}

export async function updateManagedWorkflowCron(filePath, cron) {
  const source = await readFile(filePath, "utf8");
  const updated = replaceManagedCron(source, cron);
  if (updated.changed) await writeFile(filePath, updated.source, "utf8");
  return updated.changed;
}
