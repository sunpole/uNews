export async function publishToTelegram({ token, chatId, method, mediaItems, captionText, messageText }) {
  let payload;
  if (method === "sendMediaGroup") {
    const form = new FormData();
    const media = mediaItems.map((item, index) => ({
      type: "photo",
      media: `attach://photo${index}`,
      ...(index === 0 && captionText ? { caption: captionText } : {}),
    }));
    form.append("chat_id", chatId);
    form.append("media", JSON.stringify(media));
    for (const [index, item] of mediaItems.entries()) {
      form.append(`photo${index}`, await resolveImageBlob(item), item.name);
    }
    payload = await telegramRequest(token, "sendMediaGroup", form);
  } else if (method === "sendPhoto") {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("photo", await resolveImageBlob(mediaItems[0]), mediaItems[0].name);
    form.append("caption", captionText);
    payload = await telegramRequest(token, "sendPhoto", form);
  } else {
    const body = new URLSearchParams({ chat_id: chatId, text: messageText, disable_web_page_preview: "false" });
    payload = await telegramRequest(token, "sendMessage", body);
  }
  return payload;
}

async function resolveImageBlob(item) {
  if (typeof item.loadBlob === "function") return item.loadBlob();
  return fetchImageBlob(item.url);
}

async function fetchImageBlob(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed ${response.status}: ${url}`);
  return new Blob([await response.arrayBuffer()], { type: response.headers.get("content-type") || "image/png" });
}

async function telegramRequest(token, method, body) {
  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body });
  } catch {
    throw new Error(`Telegram ${method} network request failed.`);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(`Telegram ${method} failed: ${payload?.description || response.statusText}`);
  }
  return payload;
}
