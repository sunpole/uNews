import assert from "node:assert/strict";
import { buildPublicationPolicy } from "./patchnote-policy.js";
import { UCHURCH_SHOWCASE_URL as url, planShowcaseLinks, addShowcaseButton } from "./lib/uchurch-showcase.js";

const frontMatter = { type: "patch", project: "uChurch", series: "uchurch", title: "Патч", version: "17.11.111",
  queued_at: "2026-10-09T10:00:00Z", web_url: "https://github.com/sunpole/uChurch-public/releases/tag/v17.11.111",
  image: "real.png", image_origin: "real" };
for (const body of ["Обновление проекта.", "Обновление проекта. ".repeat(200)]) {
  const policy = buildPublicationPolicy({ frontMatter, body });
  assert.equal(policy.ok, true);
  assert.ok(policy.captionText.includes(`Витрина: ${url}`));
  assert.ok(policy.messageText.includes(`Витрина: ${url}`));
  assert.ok(policy.captionText.length <= 1024);
  assert.equal(policy.captionText.split(url).length - 1, 1);
}
assert.equal(buildPublicationPolicy({ frontMatter: { ...frontMatter, web_url: url }, body: "Обновление." }).captionText.split(url).length - 1, 1);
assert.equal(buildPublicationPolicy({ frontMatter: { ...frontMatter, project: "Other", series: "other" }, body: "Обновление." }).captionText.includes(url), false);
const key = "sunpole/uChurch-public|main|news/test.md";
const other = "sunpole/uDream|main|news/test.md";
const state = { published: [key, other], details: { [key]: { message_ids: [148] }, [other]: { message_ids: [50] } } };
assert.deepEqual(planShowcaseLinks(state), [{ key, messageId: 148 }]);
state.details[key].showcase_link_url = url;
state.details[key].showcase_link_message_id = 148;
assert.deepEqual(planShowcaseLinks(state), []);
state.details[key].showcase_link_message_id = 147;
assert.equal(planShowcaseLinks(state).length, 1);
let sent;
await addShowcaseButton({ token: "synthetic", chatId: "@synthetic", messageId: 148, fetchImpl: async (endpoint, options) => {
  assert.ok(endpoint.endsWith("/editMessageReplyMarkup"));
  sent = options.body;
  return { ok: true, json: async () => ({ ok: true, result: { reply_markup: JSON.parse(sent.get("reply_markup")) } }) };
} });
assert.equal(sent.has("caption"), false);
assert.equal(sent.has("text"), false);
assert.equal(sent.has("photo"), false);
await addShowcaseButton({ token: "synthetic", chatId: "@synthetic", messageId: 148,
  fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ description: "Bad Request: message is not modified" }) }) });
await assert.rejects(addShowcaseButton({ token: "synthetic", chatId: "@synthetic", messageId: 148,
  fetchImpl: async () => { throw new Error("secret-bearing network URL"); } }), /network failure for message 148/);
await assert.rejects(addShowcaseButton({ token: "synthetic", chatId: "@synthetic", messageId: 148,
  fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, result: {} }) }) }), /did not confirm/);
console.log("uChurch showcase checks passed: footer/dedup/limits, other-project isolation, recorded IDs, idempotence, button-only request and sanitized failure.");
