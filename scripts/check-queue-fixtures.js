#!/usr/bin/env node

import assert from "node:assert/strict";
import { compareVersions, cooldownRemainingMs, parseQueuedAt, selectQueueHead } from "./lib/queue.js";
import { normalizePublishedState } from "./lib/state.js";

assert.equal(compareVersions("3.0.0", "3.1.0"), -1);
assert.equal(compareVersions("3.1.0", "3.0.0"), 1);
assert.equal(parseQueuedAt("2026-07-18T15:40:00Z"), "2026-07-18T15:40:00.000Z");
assert.equal(parseQueuedAt("not-a-date"), null);
assert.equal(compareVersions("not-semver", "3.0.0"), 0, "invalid versions must not reorder the queue");
assert.equal(cooldownRemainingMs({}, new Date("2026-07-18T16:00:00Z")), 0);
assert.equal(
  cooldownRemainingMs({ item: { published_at: "2026-07-18T15:55:00Z" } }, new Date("2026-07-18T16:00:00Z"), 600_000),
  300_000,
);

assert.throws(() => normalizePublishedState(null), /prevent duplicates/);
assert.throws(() => normalizePublishedState({ published: [], details: [] }), /prevent duplicates/);
assert.throws(
  () => normalizePublishedState({ published: ["same", "same"], details: {} }),
  /duplicate/,
);
assert.deepEqual(normalizePublishedState({ published: [], details: {} }), { published: [], details: {} });

const project = (repo) => ({ repo });
const items = [
  { key: "a-310", project: project("sunpole/a"), queuedAt: "2026-07-18T14:00:00.000Z", frontMatter: { version: "3.1.0" }, errors: [] },
  { key: "a-300", project: project("sunpole/a"), queuedAt: "2026-07-18T15:00:00.000Z", frontMatter: { version: "3.0.0" }, errors: [] },
  { key: "b-100", project: project("sunpole/b"), queuedAt: "2026-07-18T16:00:00.000Z", frontMatter: { version: "1.0.0" }, errors: [] },
];

assert.equal(selectQueueHead(items).selected.key, "a-300", "older project version must be published first");

items[1].errors = ["broken patchnote"];
const blocked = selectQueueHead(items);
assert.equal(blocked.selected.key, "b-100", "a broken project must not block other projects");
assert.equal(blocked.blocked[0].project, "sunpole/a");

console.log("OK FIFO queue, version order and per-project blocking");
