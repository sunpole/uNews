import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const markerPath = path.join(root, "news/.prepare-release.json");
const screenshotManifestPath = path.join(root, "artifacts/release/release-screenshot.json");

const marker = JSON.parse(await readFile(markerPath, "utf8"));
const screenshot = JSON.parse(await readFile(screenshotManifestPath, "utf8"));
const expectedCommit = process.env.SCREENSHOT_COMMIT || process.env.GITHUB_SHA;

if (!expectedCommit) throw new Error("Expected release source commit is missing");
if (screenshot.commit !== expectedCommit) {
  throw new Error(`Screenshot commit ${screenshot.commit} does not match ${expectedCommit}`);
}
if (screenshot.version !== marker.version) {
  throw new Error(`Screenshot version ${screenshot.version} does not match marker ${marker.version}`);
}

const queuedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const date = queuedAt.slice(0, 10);
const safeVersion = marker.version.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
const baseName = `${date}-unews-v${safeVersion}-${marker.slug}`;
const imageName = `${baseName}.png`;
const patchnoteName = `${baseName}.md`;
const sourceImage = path.join(root, "artifacts/release", screenshot.screenshot);
const targetImage = path.join(root, "news", imageName);
const targetPatchnote = path.join(root, "news", patchnoteName);
const releaseDirectory = path.join(root, "archive/development", marker.version);
const archiveName = `unews-v${safeVersion}-evidence.zip`;
const releaseManifestPath = path.join(releaseDirectory, "release.json");

function bulletList(items) {
  return items.map((item) => `- ${item};`).join("\n").replace(/;$/, ".");
}

await mkdir(path.join(root, "news"), { recursive: true });
await mkdir(releaseDirectory, { recursive: true });
await copyFile(sourceImage, targetImage);

const frontMatter = `---
type: ${marker.type}
project: uNews
series: unews
title: ${marker.title}
version: ${marker.version}
queued_at: ${queuedAt}
repo_url: https://github.com/sunpole/uNews
web_url: https://sunpole.github.io/uNews/
image: ${imageName}
image_text: ${marker.imageText}
image_source: playwright
image_target: selector/${screenshot.selector}
image_commit: ${screenshot.commit}
image_captured_at: ${screenshot.capturedAt}
---`;

const patchnote = `${frontMatter}

# ${marker.title}

${marker.summary}

Что исправлено:

${bulletList(marker.features)}

Проверенный результат:

${bulletList(marker.controlFacts)}

${marker.nextStep}

Короткий текст для Telegram:

${marker.telegramText}
`;

await writeFile(targetPatchnote, patchnote, "utf8");

const readmePath = path.join(root, "README.md");
let readme = await readFile(readmePath, "utf8");
readme = readme.replace(/Текущая версия: \*\*[^*]+\*\*\./, `Текущая версия: **${marker.version}**.`);
const historyBullet = "- автоматически создавать безопасную уменьшенную PNG-копию только для Telegram, сохраняя исходное изображение без изменений;";
if (!readme.includes(historyBullet)) {
  const anchor = "- передавать Telegram уже проверенные bytes как multipart Blob.";
  if (!readme.includes(anchor)) throw new Error("README image-integrity anchor was not found");
  readme = readme.replace(anchor, `${anchor}\n${historyBullet}`);
}
if (!readme.includes("docs/TELEGRAM_PHOTO_NORMALIZATION.md")) {
  const anchor = "Полная схема: [docs/QUEUE_ARCHITECTURE.md](docs/QUEUE_ARCHITECTURE.md). Точный контракт изображений: [docs/IMAGE_INTEGRITY.md](docs/IMAGE_INTEGRITY.md).";
  readme = readme.replace(
    anchor,
    `${anchor} Нормализация длинных PNG: [docs/TELEGRAM_PHOTO_NORMALIZATION.md](docs/TELEGRAM_PHOTO_NORMALIZATION.md).`,
  );
}
await writeFile(readmePath, readme, "utf8");

const releaseManifest = {
  schemaVersion: 1,
  project: "uNews",
  version: marker.version,
  tag: `v${marker.version}`,
  title: `uNews v${marker.version}`,
  prerelease: false,
  sourceCommit: screenshot.commit,
  createdAt: queuedAt,
  patchnote: path.relative(root, targetPatchnote).replaceAll("\\", "/"),
  image: path.relative(root, targetImage).replaceAll("\\", "/"),
  archive: path.relative(root, path.join(releaseDirectory, archiveName)).replaceAll("\\", "/"),
  screenshotManifest: path.relative(root, screenshotManifestPath).replaceAll("\\", "/"),
  telegramText: marker.telegramText,
};
await writeFile(releaseManifestPath, `${JSON.stringify(releaseManifest, null, 2)}\n`, "utf8");
await rm(markerPath);

console.log(JSON.stringify({
  queuedAt,
  patchnote: releaseManifest.patchnote,
  image: releaseManifest.image,
  releaseManifest: path.relative(root, releaseManifestPath),
  archive: releaseManifest.archive,
}, null, 2));
