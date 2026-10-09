#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { assertRealPublishAllowed } from "./patchnote-policy.js";
import { normalizePublishedState, writeJsonAtomic } from "./lib/state.js";
import { UCHURCH_SHOWCASE_URL, planShowcaseLinks, addShowcaseButton } from "./lib/uchurch-showcase.js";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) throw new Error("Usage: repair-uchurch-showcase-links.js [--apply]");
const apply = args[0] === "--apply";
assertRealPublishAllowed({ dryRun: !apply, commandName: "repair:uchurch-showcase" });
const statePath = "data/published.json";
const state = normalizePublishedState(JSON.parse(await readFile(statePath, "utf8")));
const targets = planShowcaseLinks(state);
console.log(JSON.stringify({ mode: apply ? "apply" : "check", url: UCHURCH_SHOWCASE_URL, count: targets.length, message_ids: targets.map(t => t.messageId) }));
if (apply) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (!token || !chatId) throw new Error("Telegram credentials are required.");
  for (const target of targets) {
    for (let attempt = 0; ; attempt++) {
      try {
        await addShowcaseButton({ token, chatId, messageId: target.messageId });
        break;
      } catch (error) {
        if (!error.retryAfter || error.retryAfter > 120 || attempt >= 2) throw error;
        await new Promise(resolve => setTimeout(resolve, (error.retryAfter + 1) * 1000));
      }
    }
    state.details[target.key] = { ...state.details[target.key],
      showcase_link_url: UCHURCH_SHOWCASE_URL,
      showcase_link_message_id: target.messageId,
      showcase_link_added_at: new Date().toISOString() };
    await writeJsonAtomic(statePath, state);
    console.log(`Showcase button confirmed: message ${target.messageId}`);
    await new Promise(resolve => setTimeout(resolve, 1100));
  }
  console.log(`Complete: ${targets.length} existing posts updated; no new posts sent.`);
}
