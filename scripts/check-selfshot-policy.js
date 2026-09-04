#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { buildPublicationPolicy } from "./patchnote-policy.js";

const ps = await readFile(new URL("../tools/Prepare-uNewsSelfShot.ps1", import.meta.url), "utf8");
const cmd = await readFile(new URL("../tools/Prepare-uNewsSelfShot.cmd", import.meta.url), "utf8");

for (const marker of [
  "unews-selfshot-v1",
  "image_origin",
  "image_subject",
  "image_pipeline",
  "image_meta",
  "source_sha256",
  "output_sha256",
  "raw_source_committed",
  "System.Drawing",
  "0.195",
  "0.580",
]) {
  if (!ps.includes(marker)) throw new Error(`SelfShot tool missing marker: ${marker}`);
}
if (!cmd.includes("Prepare-uNewsSelfShot.ps1")) throw new Error("SelfShot CMD wrapper is not wired.");
if (/git\s+(add|commit|push)|Invoke-WebRequest|curl\.exe/i.test(ps)) {
  throw new Error("SelfShot tool must not upload or commit the raw screenshot.");
}

const base = {
  type: "feature",
  project: "uNews",
  series: "unews",
  title: "SelfShot test",
  version: "0.3.15",
  queued_at: "2026-09-04T10:00:00Z",
  repo_url: "https://github.com/sunpole/uNews",
  image: "selfshot.jpg",
  image_origin: "real",
};

const missing = buildPublicationPolicy({
  frontMatter: base,
  body: "Короткий текст для Telegram:\nОбновление uNews.",
});
if (missing.ok || !missing.errors.some((x) => x.includes("image_pipeline"))) {
  throw new Error("uNews self-post without SelfShot fields was not blocked.");
}

const valid = buildPublicationPolicy({
  frontMatter: {
    ...base,
    image_subject: "telegram-channel",
    image_pipeline: "unews-selfshot-v1",
    image_meta: "selfshot.selfshot.json",
  },
  body: "Короткий текст для Telegram:\nОбновление uNews.",
});
if (!valid.ok) throw new Error(valid.errors.join("\n"));
console.log("SelfShot policy checks passed.");
