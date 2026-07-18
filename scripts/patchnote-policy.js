export const TELEGRAM_CAPTION_LIMIT = 1024;
export const TELEGRAM_MESSAGE_LIMIT = 4096;

const REQUIRED_WORD_TYPES = new Set(["patch", "docs", "feature", "bugfix", "release"]);
const ALLOWED_TYPES = new Set(["intro", "test", "release", "patch", "bugfix", "docs", "ui", "feature", "warning", "idea", "roadmap", "report", "note"]);
const REQUIRED_WORD_RE = /(патч|обновление|релиз|документационное обновление)/i;
const SHORT_TEXT_RE = /(?:^|\r?\n)(?:#{1,6}\s*)?Короткий текст для Telegram:\s*\r?\n([\s\S]*)$/i;
const RUSSIAN_REQUIRED_PROJECTS = new Set(["uSugar"]);
const BROKEN_TEXT_RE = /(\uFFFD|\?{3,}|Рџ|РЎ|Рќ|Рћ|Р‘|Р“|Р”|Р•|Р–|Р—|Р™|Рљ|Рњ|Рђ|СЃ|С‚|СЊ|С‹|СЋ|СЏ|СЂ|С‡|С€|С‰)/u;

const HASHTAG_MAPPING = new Map([
  ["uSugar", "#uSugar #тыСахар #uNews #Sunpole"],
  ["uNews", "#uNews #тыНовости #Sunpole"],
  ["uDream", "#uDream #тыСон #uNews #Sunpole"],
  ["uChurch", "#uChurch #тыЦерковь #uNews #Sunpole"],
  ["500 Tower Defense", "#500TD #500ТД #uNews #Sunpole"],
]);

const TYPE_PREFIX = new Map([
  ["patch", "Патч."],
  ["docs", "Документационное обновление."],
  ["feature", "Обновление."],
  ["bugfix", "Патч исправления."],
  ["release", "Релиз."],
]);

export function getImageNames(frontMatter) {
  if (Array.isArray(frontMatter.images) && frontMatter.images.length > 0) {
    return frontMatter.images.filter(Boolean);
  }

  if (frontMatter.image) {
    return [frontMatter.image];
  }

  return [];
}

export function getSourceTelegramText(frontMatter, body) {
  const shortTextMatch = body.match(SHORT_TEXT_RE);
  const text = shortTextMatch ? shortTextMatch[1] : body;
  return text.trim() || frontMatter.title || "uNews";
}

export function buildPublicationPolicy({ frontMatter, body }) {
  const errors = validatePatchnote({ frontMatter, body });
  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      imageNames: getImageNames(frontMatter),
      link: buildLink(frontMatter),
      hashtags: getProjectHashtags(frontMatter.project, frontMatter.series),
    };
  }

  const sourceText = getSourceTelegramText(frontMatter, body);
  const mainText = ensureRequiredWording(sourceText, frontMatter.type);
  const link = buildLink(frontMatter);
  const hashtags = getProjectHashtags(frontMatter.project, frontMatter.series);
  const footer = `Ссылка: ${link}\n\n${hashtags}`;

  const caption = limitWithFooter(mainText, footer, TELEGRAM_CAPTION_LIMIT);
  const message = limitWithFooter(mainText, footer, TELEGRAM_MESSAGE_LIMIT);

  return {
    ok: true,
    errors: [],
    imageNames: getImageNames(frontMatter),
    link,
    hashtags,
    footer,
    sourceText,
    captionText: caption.text,
    captionWasTruncated: caption.truncated,
    messageText: message.text,
    messageWasTruncated: message.truncated,
  };
}

export function assertPublicationPolicy({ frontMatter, body, label = "patchnote" }) {
  const policy = buildPublicationPolicy({ frontMatter, body });
  if (!policy.ok) {
    throw new Error(`Patchnote policy failed for ${label}:\n- ${policy.errors.join("\n- ")}`);
  }
  return policy;
}

export function assertRealPublishAllowed({ dryRun, commandName }) {
  if (dryRun) return;
  if (process.env.GITHUB_ACTIONS === "true") return;

  throw new Error(
    `${commandName} is blocked locally. Real publishing must run through GitHub Actions. ` +
      `Use the matching :check command locally.`,
  );
}

export function buildPostUrl(chatId, messageId) {
  if (!messageId || !chatId || !chatId.startsWith("@")) return null;
  return `https://t.me/${chatId.slice(1)}/${messageId}`;
}

export function extractTelegramMessageIds(payload) {
  if (!payload?.ok) return [];
  if (Array.isArray(payload.result)) {
    return payload.result.map((message) => message?.message_id).filter(Boolean);
  }
  if (payload.result?.message_id) return [payload.result.message_id];
  return [];
}

function validatePatchnote({ frontMatter, body }) {
  const errors = [];
  const textForSafety = `${JSON.stringify(frontMatter)}\n${body}`;

  for (const field of ["type", "project", "series", "title", "version", "queued_at"]) {
    if (!frontMatter[field]) errors.push(`Missing required field: ${field}`);
  }

  if (frontMatter.type && !ALLOWED_TYPES.has(String(frontMatter.type).toLowerCase())) {
    errors.push(`Unsupported type: ${frontMatter.type}`);
  }

  if (frontMatter.queued_at && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(String(frontMatter.queued_at))) {
    errors.push("Invalid queued_at: use exact UTC format YYYY-MM-DDTHH:mm:ssZ.");
  } else if (frontMatter.queued_at && Number.isNaN(Date.parse(frontMatter.queued_at))) {
    errors.push("Invalid queued_at: date does not exist.");
  }

  const imageNames = getImageNames(frontMatter);
  if (imageNames.length === 0) {
    errors.push("Missing image/images: Telegram posts require a safe visual asset.");
  }
  for (const imageName of imageNames) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|webp|gif)$/i.test(String(imageName)) || String(imageName).includes("..")) {
      errors.push(`Unsafe image name: ${imageName}. Use a file name from the same news folder.`);
    }
  }

  if (!buildLink(frontMatter)) {
    errors.push("Missing usable link: add web_url or repo_url.");
  }

  if (frontMatter.project && !getProjectHashtags(frontMatter.project, frontMatter.series)) {
    errors.push(`Cannot build hashtags for project: ${frontMatter.project}. Add a safe series value.`);
  }

  const secretRisk = findSecretRisk(textForSafety);
  if (secretRisk) errors.push(secretRisk);

  const brokenTextRisk = findBrokenTextRisk(textForSafety);
  if (brokenTextRisk) errors.push(brokenTextRisk);

  if (frontMatter.project === "uSugar") {
    const usugarRisk = findUsugarRisk(textForSafety);
    if (usugarRisk) errors.push(usugarRisk);
  }

  if (frontMatter.project && RUSSIAN_REQUIRED_PROJECTS.has(frontMatter.project)) {
    if (!frontMatter.image_text) {
      errors.push("Missing image_text: uSugar cards require machine-checkable visible text.");
    } else {
      const imageTextRisk = findBrokenTextRisk(String(frontMatter.image_text));
      if (imageTextRisk) errors.push(`image_text failed: ${imageTextRisk}`);
      if (!hasMeaningfulRussian(String(frontMatter.image_text))) {
        errors.push("image_text must contain meaningful Russian text for uSugar.");
      }
    }

    const russianText = `${frontMatter.title || ""}\n${body || ""}`;
    if (!hasMeaningfulRussian(russianText)) {
      errors.push("uSugar caption/body must contain meaningful Russian prose.");
    }
  }

  return errors;
}

function buildLink(frontMatter) {
  if (frontMatter.web_url) return frontMatter.web_url;
  if (!frontMatter.repo_url) return null;
  if (!frontMatter.branch) return frontMatter.repo_url;

  return `${frontMatter.repo_url.replace(/\/$/, "")}/tree/${encodeBranchPath(frontMatter.branch)}`;
}

function encodeBranchPath(branch) {
  return String(branch)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function getProjectHashtags(project, series) {
  const mapped = HASHTAG_MAPPING.get(project);
  if (mapped) return mapped;
  const genericTag = String(series || "").replace(/[^A-Za-z0-9_]/g, "");
  return genericTag ? `#${genericTag} #uNews #тыНовости #Sunpole` : null;
}

function ensureRequiredWording(text, type) {
  const normalizedType = String(type || "").toLowerCase();
  if (!REQUIRED_WORD_TYPES.has(normalizedType) || REQUIRED_WORD_RE.test(text)) {
    return text;
  }

  return `${TYPE_PREFIX.get(normalizedType) || "Обновление."} ${text}`;
}

function limitWithFooter(mainText, footer, limit) {
  const separator = "\n\n";
  const fullText = `${mainText}${separator}${footer}`;
  if (fullText.length <= limit) return { text: fullText, truncated: false };

  const suffix = "\n\n...\nПолный текст см. в патчноуте.";
  const available = limit - separator.length - footer.length - suffix.length;
  if (available <= 0) {
    throw new Error("Telegram footer is too long for the configured message limit.");
  }

  return {
    text: `${mainText.slice(0, available).trimEnd()}${suffix}${separator}${footer}`,
    truncated: true,
  };
}

function findSecretRisk(text) {
  const checks = [
    { re: /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/, label: "token-looking string" },
    { re: /\bTELEGRAM_BOT_TOKEN\b/i, label: "TELEGRAM_BOT_TOKEN" },
    { re: /\bBOT_TOKEN\b/i, label: "BOT_TOKEN" },
    { re: /\bDEEPSEEK_API_KEY\b/i, label: "DEEPSEEK_API_KEY" },
    { re: /(^|[^\w])\.env([^\w]|$)/i, label: ".env reference" },
  ];

  const match = checks.find((check) => check.re.test(text));
  return match ? `Secret-like text detected: ${match.label}` : null;
}

function findBrokenTextRisk(text) {
  if (BROKEN_TEXT_RE.test(text)) {
    return "Broken/mojibake text detected.";
  }
  return null;
}

function hasMeaningfulRussian(text) {
  const cyrillic = (String(text).match(/[А-Яа-яЁё]/g) || []).length;
  const latin = (String(text).match(/[A-Za-z]/g) || []).length;
  if (cyrillic < 30) return false;
  return cyrillic >= Math.max(30, Math.floor(latin * 0.2));
}

function findUsugarRisk(text) {
  const checks = [
    { re: /\b(user_id|chat_id|file_id)\b/i, label: "private Telegram identifier" },
    { re: /https?:\/\/[^\s]*ngrok[^\s]*/i, label: "ngrok URL" },
    { re: /(?<![\d.])(?:[2-9]|1\d|2[0-5])[\.,]\d(?![\d.])\s*(?:mmol|ммоль|mg\/dL|мг\/дл)?/i, label: "glucose-like medical value" },
  ];

  const match = checks.find((check) => check.re.test(text));
  return match ? `uSugar private/medical risk detected: ${match.label}` : null;
}
