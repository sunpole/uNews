import { readFile } from "node:fs/promises";

export const DEFAULT_PROJECT_INTRO_STATE = Object.freeze({
  schema: 1,
  series: {},
  legacy_without_intro: ["unews","usugar","udream","uchurch","500td","goart","time-rift"],
});

export function normalizeProjectIntroState(state) {
  const source = state && typeof state === "object" ? state : {};
  const series = source.series && typeof source.series === "object" && !Array.isArray(source.series) ? source.series : {};
  const legacy = Array.isArray(source.legacy_without_intro)
    ? source.legacy_without_intro.map((value) => String(value).toLowerCase())
    : [...DEFAULT_PROJECT_INTRO_STATE.legacy_without_intro];
  return { schema: 1, series, legacy_without_intro: [...new Set(legacy)].sort() };
}

export async function loadProjectIntroState(filePath = new URL("../../data/project-intros.json", import.meta.url)) {
  try {
    return normalizeProjectIntroState(JSON.parse(await readFile(filePath, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return normalizeProjectIntroState(DEFAULT_PROJECT_INTRO_STATE);
    throw new Error(`Cannot read valid project intro state: ${error.message}`);
  }
}

export function resolveProjectIntro(state, series) {
  const normalized = normalizeProjectIntroState(state);
  const key = String(series || "").toLowerCase();
  return key ? normalized.series[key] || null : null;
}

export function assertProjectIntroRequirement({ state, frontMatter }) {
  const type = String(frontMatter.type || "").toLowerCase();
  const series = String(frontMatter.series || "").toLowerCase();
  if (!series || type === "intro") return null;
  const intro = resolveProjectIntro(state, series);
  if (intro?.post_url) return intro;
  const normalized = normalizeProjectIntroState(state);
  if (normalized.legacy_without_intro.includes(series)) return null;
  throw new Error(`Project series "${series}" has no registered intro post. Publish type: intro first; future updates must link back to it.`);
}

export function recordProjectIntro({ state, frontMatter, key, result, publishedAt }) {
  if (String(frontMatter.type || "").toLowerCase() !== "intro") return false;
  const series = String(frontMatter.series || "").toLowerCase();
  if (!series) throw new Error("Intro post has no series.");
  if (!result?.postUrl || !result?.messageIds?.[0]) throw new Error("Intro post cannot be registered without Telegram post URL and message ID.");
  const normalized = normalizeProjectIntroState(state);
  normalized.series[series] = {
    project: String(frontMatter.project || ""),
    series,
    key,
    message_id: Number(result.messageIds[0]),
    post_url: result.postUrl,
    published_at: publishedAt,
  };
  state.schema = normalized.schema;
  state.series = normalized.series;
  state.legacy_without_intro = normalized.legacy_without_intro;
  return true;
}
