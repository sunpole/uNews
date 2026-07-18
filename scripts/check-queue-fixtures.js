#!/usr/bin/env node

import assert from "node:assert/strict";
import { compareVersions, parseQueuedAt, selectQueueHead } from "./lib/queue.js";

assert.equal(compareVersions("3.0.0", "3.1.0"), -1);
assert.equal(compareVersions("3.1.0", "3.0.0"), 1);
assert.equal(parseQueuedAt("2026-07-18T15:40:00Z"), "2026-07-18T15:40:00.000Z");
assert.equal(parseQueuedAt("not-a-date"), null);

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
