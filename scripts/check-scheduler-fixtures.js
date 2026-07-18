#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  ADAPTIVE_SCHEDULES,
  buildAdaptiveSchedule,
  replaceManagedCron,
  selectAdaptiveTier,
} from "./lib/adaptive-schedule.js";

const hour = 60 * 60 * 1000;
assert.equal(selectAdaptiveTier(hour - 1), "fast");
assert.equal(selectAdaptiveTier(hour), "two-hour");
assert.equal(selectAdaptiveTier(4 * hour), "twelve-hour");
assert.equal(selectAdaptiveTier(12 * hour), "daily");
assert.equal(selectAdaptiveTier(24 * hour), "three-day");
assert.equal(selectAdaptiveTier(72 * hour), "weekly");

const state = {
  schema: 1,
  tier: "fast",
  cron: ADAPTIVE_SCHEDULES.fast,
  last_activity_at: "2026-07-18T10:00:00.000Z",
  last_check_at: "2026-07-18T10:00:00.000Z",
  candidate_revisions: { "project|news/item.md": "sha-1" },
};

const unchanged = buildAdaptiveSchedule({
  state,
  candidates: [{ key: "project|news/item.md", revision: "sha-1" }],
  readyCount: 0,
  now: Date.parse("2026-07-18T14:00:00.000Z"),
});
assert.equal(unchanged.activityDetected, false, "the same blocked patchnote must not look new forever");
assert.equal(unchanged.state.tier, "twelve-hour");

const changed = buildAdaptiveSchedule({
  state,
  candidates: [{ key: "project|news/item.md", revision: "sha-2" }],
  readyCount: 0,
  now: Date.parse("2026-07-18T14:00:00.000Z"),
});
assert.equal(changed.activityDetected, true, "a corrected patchnote revision must wake the queue");
assert.equal(changed.state.tier, "fast");

const pending = buildAdaptiveSchedule({
  state,
  candidates: [{ key: "project|news/item.md", revision: "sha-1" }],
  readyCount: 1,
  now: Date.parse("2026-07-25T10:00:00.000Z"),
});
assert.equal(pending.state.tier, "fast", "a ready queue must remain fast until it is drained");

const workflow = `on:\n  schedule:\n    # uNews adaptive schedule — managed by scripts/lib/adaptive-schedule.js\n    - cron: "7,22,37,52 * * * *"\n`;
const replaced = replaceManagedCron(workflow, ADAPTIVE_SCHEDULES.weekly);
assert.equal(replaced.changed, true);
assert.match(replaced.source, /7 7 \* \* 1/);
assert.equal(replaceManagedCron(replaced.source, ADAPTIVE_SCHEDULES.weekly).changed, false);
assert.throws(() => replaceManagedCron(workflow, "* * * * *"), /Unsupported adaptive cron/);

console.log("OK adaptive schedule tiers, activity detection and managed cron");
