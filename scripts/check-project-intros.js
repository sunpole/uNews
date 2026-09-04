#!/usr/bin/env node
import { assertProjectIntroRequirement, normalizeProjectIntroState, recordProjectIntro, resolveProjectIntro } from "./lib/project-intros.js";

const state = normalizeProjectIntroState({
  schema: 1,
  series: { umontage: { project: "uMontage", series: "umontage", message_id: 133, post_url: "https://t.me/uNewsLog/133" } },
  legacy_without_intro: ["unews"],
});

if (resolveProjectIntro(state, "uMontage")?.post_url !== "https://t.me/uNewsLog/133") throw new Error("registered intro was not resolved");
console.log("OK registered intro resolves by series");

const resolved = assertProjectIntroRequirement({ state, frontMatter: { type: "feature", series: "uMontage" } });
if (resolved?.post_url !== "https://t.me/uNewsLog/133") throw new Error("update did not receive intro");
console.log("OK future update receives intro");

assertProjectIntroRequirement({ state, frontMatter: { type: "feature", series: "unews" } });
console.log("OK legacy series remains grandfathered");

let blocked = false;
try { assertProjectIntroRequirement({ state, frontMatter: { type: "feature", series: "brand-new-project" } }); }
catch (error) { blocked = error.message.includes("Publish type: intro first"); }
if (!blocked) throw new Error("new project without intro was not blocked");
console.log("OK new project without intro is blocked");

const mutable = normalizeProjectIntroState({ schema: 1, series: {}, legacy_without_intro: [] });
const changed = recordProjectIntro({
  state: mutable,
  frontMatter: { type: "intro", project: "New Project", series: "new-project" },
  key: "sunpole/new|main|news/intro.md",
  result: { postUrl: "https://t.me/uNewsLog/200", messageIds: [200] },
  publishedAt: "2026-09-04T10:00:00.000Z",
});
if (!changed || mutable.series["new-project"]?.message_id !== 200) throw new Error("intro checkpoint was not recorded");
console.log("OK intro publication registers Telegram root post");
