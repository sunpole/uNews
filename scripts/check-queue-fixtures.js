#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertImageBufferMatchesName, detectImageType, fetchAndValidateRemoteImage } from "./lib/image-validation.js";
import { compareVersions, cooldownRemainingMs, parseQueuedAt, selectQueueBatch, selectQueueHead } from "./lib/queue.js";
import { buildFailureHealthSnapshot, recordFatalRun, sanitizeFailureMessage } from "./lib/run-state.js";
import { buildHealthSnapshot, normalizePublishedState, selectedKeyAfterRun, writeJsonIfChangedOrStale } from "./lib/state.js";

const padded = (prefix, suffix = Buffer.alloc(0)) => Buffer.concat([
  prefix,
  Buffer.alloc(Math.max(0, 80 - prefix.length - suffix.length)),
  suffix,
]);
const pngFixture = padded(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const jpegFixture = padded(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from([0xff, 0xd9]));
const gifFixture = padded(Buffer.from("GIF89a", "ascii"));
const webpFixture = padded(Buffer.from("RIFF0000WEBP", "ascii"));

assert.equal(detectImageType(pngFixture), "png");
assert.equal(detectImageType(jpegFixture), "jpeg");
assert.equal(detectImageType(gifFixture), "gif");
assert.equal(detectImageType(webpFixture), "webp");
assert.equal(detectImageType(Buffer.from("not an image")), "unknown");
assert.equal(assertImageBufferMatchesName(pngFixture, "card.png").bytes, 80);
assert.equal(assertImageBufferMatchesName(jpegFixture, "card.jpg").type, "jpeg");
assert.equal(assertImageBufferMatchesName(gifFixture, "card.gif").type, "gif");
assert.equal(assertImageBufferMatchesName(webpFixture, "card.webp").type, "webp");
assert.throws(
  () => assertImageBufferMatchesName(Buffer.from("<!doctype html>not a png".padEnd(80, " ")), "card.png"),
  /signature mismatch.*detected unknown/,
);
assert.throws(
  () => assertImageBufferMatchesName(jpegFixture, "card.png"),
  /declares png, detected jpeg/,
);
assert.throws(
  () => assertImageBufferMatchesName(Buffer.alloc(10), "card.png"),
  /unexpectedly small/,
);
assert.throws(
  () => assertImageBufferMatchesName(pngFixture, "card.svg"),
  /Unsupported image extension/,
);

const fetchedImage = await fetchAndValidateRemoteImage(
  "https://example.test/card.png",
  "card.png",
  {
    fetchImpl: async () => new Response(pngFixture, {
      status: 200,
      headers: { "content-length": String(pngFixture.length), "content-type": "application/octet-stream" },
    }),
  },
);
assert.deepEqual(fetchedImage, { imageName: "card.png", type: "png", bytes: 80 });
await assert.rejects(
  fetchAndValidateRemoteImage(
    "https://example.test/missing.png",
    "missing.png",
    { fetchImpl: async () => new Response("not found", { status: 404 }) },
  ),
  /not available \(404\)/,
);

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
assert.equal(selectedKeyAfterRun("project|news/item.md", false), "project|news/item.md");
assert.equal(selectedKeyAfterRun("project|news/item.md", true), null, "published item must disappear from health selection");

const successfulHealth = buildHealthSnapshot({
  checkedAt: "2026-07-22T09:30:00Z",
  pendingCount: 8,
  readyCount: 1,
  blockedCount: 0,
  selectedKey: "sunpole/udream|main|news/item.md",
  dryRun: false,
});
assert.equal(successfulHealth.last_attempt_status, "success");
assert.equal(successfulHealth.last_error, null);
assert.equal(successfulHealth.last_successful_check_at, "2026-07-22T09:30:00Z");

const safeFailure = sanitizeFailureMessage(
  "Telegram bot123456:abcdefghijklmnopqrstuvwxyz failed with 123456:abcdefghijklmnopqrstuvwxyz",
  ["123456:abcdefghijklmnopqrstuvwxyz"],
);
assert.equal(safeFailure.includes("abcdefghijklmnopqrstuvwxyz"), false, "failure text must redact Telegram tokens");

const failedHealth = buildFailureHealthSnapshot(
  {
    last_successful_check_at: "2026-07-19T21:01:36Z",
    pending_count: 8,
    ready_project_count: 1,
    error_count: 0,
    selected_key: "sunpole/udream|main|news/item.md",
  },
  {
    checkedAt: "2026-07-22T09:31:00Z",
    message: "Telegram preflight failed",
  },
);
assert.equal(failedHealth.last_successful_check_at, "2026-07-19T21:01:36Z");
assert.equal(failedHealth.last_attempt_at, "2026-07-22T09:31:00Z");
assert.equal(failedHealth.last_attempt_status, "failed");
assert.equal(failedHealth.error_count, 1);
assert.equal(failedHealth.last_error, "Telegram preflight failed");

const tempDirectory = await mkdtemp(path.join(tmpdir(), "unews-state-"));
const healthPath = path.join(tempDirectory, "health.json");
const errorsPath = path.join(tempDirectory, "errors.json");
const originalHealth = { last_successful_check_at: "2026-07-18T10:00:00Z", pending_count: 0 };
const nextHealth = { last_successful_check_at: "2026-07-18T10:15:00Z", pending_count: 0 };
await writeFile(healthPath, JSON.stringify(originalHealth), "utf8");
assert.equal(
  await writeJsonIfChangedOrStale(healthPath, nextHealth, {
    ignoredKeys: ["last_successful_check_at"],
    timestampKey: "last_successful_check_at",
    maxAgeMs: 24 * 60 * 60 * 1000,
    now: Date.parse("2026-07-18T10:15:00Z"),
  }),
  false,
  "an unchanged fresh health snapshot must not create a commit",
);
assert.deepEqual(JSON.parse(await readFile(healthPath, "utf8")), originalHealth);
assert.equal(
  await writeJsonIfChangedOrStale(healthPath, nextHealth, {
    ignoredKeys: ["last_successful_check_at"],
    timestampKey: "last_successful_check_at",
    maxAgeMs: 24 * 60 * 60 * 1000,
    now: Date.parse("2026-07-19T10:00:00Z"),
  }),
  true,
  "a daily health heartbeat must eventually be persisted",
);

await recordFatalRun({
  message: "Publisher failed with SECRET_VALUE",
  checkedAt: "2026-07-22T09:32:00Z",
  healthPath,
  errorsPath,
  secretValues: ["SECRET_VALUE"],
});
const recordedHealth = JSON.parse(await readFile(healthPath, "utf8"));
const recordedErrors = JSON.parse(await readFile(errorsPath, "utf8"));
assert.equal(recordedHealth.last_successful_check_at, "2026-07-18T10:15:00Z");
assert.equal(recordedHealth.last_attempt_status, "failed");
assert.equal(recordedHealth.last_error.includes("SECRET_VALUE"), false);
assert.equal(recordedErrors.errors[0].kind, "fatal-run");
assert.equal(recordedErrors.errors[0].errors[0].includes("SECRET_VALUE"), false);
await rm(tempDirectory, { recursive: true });

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

const batchItems = [
  { key: "a-310", project: project("sunpole/a"), queuedAt: "2026-07-18T14:00:00.000Z", frontMatter: { version: "3.1.0" }, errors: [] },
  { key: "a-300", project: project("sunpole/a"), queuedAt: "2026-07-18T15:00:00.000Z", frontMatter: { version: "3.0.0" }, errors: [] },
  { key: "b-100", project: project("sunpole/b"), queuedAt: "2026-07-18T16:00:00.000Z", frontMatter: { version: "1.0.0" }, errors: [] },
];
assert.deepEqual(
  selectQueueBatch(batchItems, 20).selected.map((item) => item.key),
  ["a-300", "a-310", "b-100"],
  "a batch must preserve project version order while draining every ready item",
);
assert.deepEqual(
  selectQueueBatch(batchItems, 2).selected.map((item) => item.key),
  ["a-300", "a-310"],
  "a batch must honor its safety limit",
);

console.log("OK image signatures, FIFO queue, version order, recovery state and per-project blocking");
