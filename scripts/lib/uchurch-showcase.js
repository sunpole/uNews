export const UCHURCH_SHOWCASE_URL = "https://sunpole.github.io/uChurch-public/";
const REPOSITORIES = new Set(["sunpole/uChurch", "sunpole/uChurch-public"]);

export function planShowcaseLinks(state) {
  const published = new Set(state.published);
  const seen = new Set();
  const targets = [];
  for (const [key, details] of Object.entries(state.details)) {
    if (!published.has(key) || !REPOSITORIES.has(key.split("|")[0])) continue;
    const messageId = details.message_ids?.[0];
    if (!Number.isSafeInteger(messageId) || messageId < 1) throw new Error("uChurch post has no valid recorded message ID.");
    if (seen.has(messageId)) throw new Error("Duplicate uChurch message ID; repair stopped.");
    seen.add(messageId);
    if (details.showcase_link_url === UCHURCH_SHOWCASE_URL && details.showcase_link_message_id === messageId) continue;
    targets.push({ key, messageId });
  }
  return targets;
}

export async function addShowcaseButton({ token, chatId, messageId, fetchImpl = fetch }) {
  const markup = { inline_keyboard: [[{ text: "Витрина uChurch", url: UCHURCH_SHOWCASE_URL }]] };
  let response;
  try {
    response = await fetchImpl(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: "POST",
      body: new URLSearchParams({ chat_id: chatId, message_id: String(messageId), reply_markup: JSON.stringify(markup) }),
    });
  } catch {
    throw new Error(`Telegram showcase link network failure for message ${messageId}.`);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    if (response.status === 400 && /message is not modified/i.test(payload?.description || "")) return;
    const retryAfter = Number(payload?.parameters?.retry_after);
    const error = new Error(`Telegram showcase link failed for message ${messageId} (HTTP ${response.status}).`);
    if (response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = retryAfter;
    throw error;
  }
  const button = payload.result?.reply_markup?.inline_keyboard?.[0]?.[0];
  if (button?.url !== UCHURCH_SHOWCASE_URL || button?.text !== "Витрина uChurch") {
    throw new Error(`Telegram did not confirm the showcase button for message ${messageId}.`);
  }
}
