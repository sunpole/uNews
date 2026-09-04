#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";
import { assertPublicationPolicy, assertRealPublishAllowed, buildPostUrl } from "./patchnote-policy.js";
import { parsePatchnote } from "./lib/front-matter.js";
import { fetchValidatedImage, validatedImageBlob } from "./lib/image-integrity.js";
import { normalizeTelegramPhoto } from "./lib/telegram-photo.js";
import { assertProjectIntroRequirement, loadProjectIntroState } from "./lib/project-intros.js";
import { normalizePublishedState, writeJsonAtomic } from "./lib/state.js";

const REQUEST_PATH = ".github/unews-edit-request.json";

function parsePublishedKey(key) {
  const parts = String(key || "").split("|");
  if (parts.length !== 3) throw new Error("Published key must be owner/repo|branch|news/file.md.");
  return { repo: parts[0], branch: parts[1], path: parts[2] };
}
function rawUrl(repo, branch, filePath) {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error("Invalid repository in published key.");
  return `https://raw.githubusercontent.com/${owner}/${name}/${encodeURIComponent(branch)}/${filePath.split("/").map(encodeURIComponent).join("/")}`;
}
async function editCaption(token, chatId, messageId, caption) {
  const body = new URLSearchParams({ chat_id: chatId, message_id: String(messageId), caption });
  const response = await fetch(`https://api.telegram.org/bot${token}/editMessageCaption`, { method: "POST", body });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(`Telegram editMessageCaption failed: ${payload?.description || response.statusText}`);
}
async function editMedia(token, chatId, messageId, caption, imageName, validated) {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("message_id", String(messageId));
  form.append("media", JSON.stringify({ type: "photo", media: "attach://photo", caption }));
  form.append("photo", await validatedImageBlob(validated), imageName);
  const response = await fetch(`https://api.telegram.org/bot${token}/editMessageMedia`, { method: "POST", body: form });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(`Telegram editMessageMedia failed: ${payload?.description || response.statusText}`);
}

async function main() {
  assertRealPublishAllowed({ dryRun: false, commandName: "repair:published" });
  const request = JSON.parse(await readFile(REQUEST_PATH, "utf8"));
  if (request.enabled !== true) { console.log("Edit request disabled; nothing to do."); return; }
  if (!["caption","media"].includes(request.mode)) throw new Error("Edit request mode must be caption or media.");

  const statePath = "data/published.json";
  const state = normalizePublishedState(JSON.parse(await readFile(statePath, "utf8")));
  const details = state.details[request.key];
  if (!details?.message_ids?.[0]) throw new Error("Published key has no recorded Telegram message ID.");

  const source = parsePublishedKey(request.key);
  const mdResponse = await fetch(rawUrl(source.repo, source.branch, source.path));
  if (!mdResponse.ok) throw new Error(`Patchnote download failed: HTTP ${mdResponse.status}`);
  const { frontMatter, body } = parsePatchnote(await mdResponse.text(), request.key);

  const introState = await loadProjectIntroState();
  const intro = assertProjectIntroRequirement({ state: introState, frontMatter });
  const policy = assertPublicationPolicy({ frontMatter, body, introUrl: intro?.post_url || null, label: request.key });

  const token = process.env.TELEGRAM_BOT_TOKEN, chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (!token || !chatId) throw new Error("Telegram credentials are required.");
  const messageId = Number(details.message_ids[0]);

  if (request.mode === "media") {
    if (policy.imageNames.length !== 1) throw new Error(`Media repair requires exactly one image, got ${policy.imageNames.length}.`);
    const imageName = policy.imageNames[0];
    const imagePath = source.path.split("/").slice(0,-1).concat(imageName).join("/");
    const original = await fetchValidatedImage(rawUrl(source.repo, source.branch, imagePath), { fileName:imageName, label:`${request.key} repair image ${imageName}` });
    const normalized = normalizeTelegramPhoto(original, { fileName:imageName, label:`${request.key} repair image ${imageName}` });
    await editMedia(token, chatId, messageId, policy.captionText, imageName, normalized);
  } else {
    await editCaption(token, chatId, messageId, policy.captionText);
  }

  const now = new Date().toISOString();
  state.details[request.key] = {
    ...details,
    post_url: details.post_url || buildPostUrl(chatId, messageId),
    caption_edited_at: now,
    ...(request.mode === "media" ? { media_edited_at: now } : {}),
    project: frontMatter.project || details.project || null,
    series: frontMatter.series || details.series || null,
    type: frontMatter.type || details.type || null
  };
  await writeJsonAtomic(statePath, state);
  console.log(`Repaired published post: ${state.details[request.key].post_url}`);
}
main().catch((error)=>{ console.error(error.message); process.exit(1); });
