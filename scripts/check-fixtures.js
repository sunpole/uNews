#!/usr/bin/env node

import { buildPublicationPolicy } from "./patchnote-policy.js";
import { isPublishableNewsMarkdown } from "./lib/github-client.js";

const validUsugarFrontMatter = {
  type: "docs",
  project: "uSugar",
  series: "usugar",
  title: "Карта задач",
  version: "1.5.2",
  queued_at: "2026-07-18T15:40:00Z",
  repo_url: "https://github.com/sunpole/uSugar",
  image: "safe.png",
  image_text: "uSugar карта задач документационное обновление без приватных данных",
};

const newsScannerFixtures = [
  {
    name: "dated patchnote markdown is publishable",
    entry: { type: "file", name: "2026-07-26-unews-v0-3-9-queue-policy.md" },
    expected: true,
  },
  {
    name: "news README is documentation, not a patchnote",
    entry: { type: "file", name: "README.md" },
    expected: false,
  },
  {
    name: "undated markdown note is not a queued patchnote",
    entry: { type: "file", name: "draft-policy.md" },
    expected: false,
  },
  {
    name: "image asset is not a markdown patchnote",
    entry: { type: "file", name: "2026-07-26-unews-v0-3-9-queue-policy.png" },
    expected: false,
  },
];

for (const fixture of newsScannerFixtures) {
  const actual = isPublishableNewsMarkdown(fixture.entry);
  if (actual !== fixture.expected) {
    throw new Error(`news scanner fixture failed: ${fixture.name}; expected ${fixture.expected}, got ${actual}`);
  }
  console.log(`OK ${fixture.name}`);
}

const fixtures = [
  {
    name: "missing type",
    shouldPass: false,
    frontMatter: { ...validUsugarFrontMatter, type: undefined },
    body: "Короткий текст для Telegram:\nДокументационное обновление uSugar с русским текстом.",
    expected: "Missing required field: type",
  },
  {
    name: "unsupported type",
    shouldPass: false,
    frontMatter: { ...validUsugarFrontMatter, type: "unknown-type" },
    body: "Короткий текст для Telegram:\nДокументационное обновление uSugar с русским текстом.",
    expected: "Unsupported type",
  },
  {
    name: "documentation type alias",
    shouldPass: true,
    frontMatter: {
      type: "documentation",
      project: "uDream",
      series: "udream",
      title: "Data provenance",
      version: "23.8.8",
      queued_at: "2026-07-22T09:40:00Z",
      repo_url: "https://github.com/sunpole/udream",
      image: "safe.png",
    },
    body: "Короткий текст для Telegram:\nПроверена история данных и аккуратно описано происхождение источников.",
    assert(policy) {
      if (!policy.captionText.includes("Документационное обновление.")) {
        throw new Error("documentation alias did not receive docs wording");
      }
      if (!policy.captionText.includes("#uDream #тыСон #uNews #Sunpole")) {
        throw new Error("documentation alias has no uDream hashtags");
      }
    },
  },
  {
    name: "missing queued_at",
    shouldPass: false,
    frontMatter: {
      ...validUsugarFrontMatter,
      project: "uNews",
      series: "unews",
      title: "Нет времени",
      repo_url: "https://github.com/sunpole/uNews",
      image_text: undefined,
      queued_at: undefined,
    },
    body: "Короткий текст.",
    expected: "Missing required field: queued_at",
  },
  {
    name: "unsafe image path",
    shouldPass: false,
    frontMatter: {
      ...validUsugarFrontMatter,
      project: "uNews",
      series: "unews",
      title: "Плохой путь",
      repo_url: "https://github.com/sunpole/uNews",
      image_text: undefined,
      image: "../secret.png",
    },
    body: "Короткий текст.",
    expected: "Unsafe image name",
  },
  {
    name: "invalid queued_at format",
    shouldPass: false,
    frontMatter: {
      ...validUsugarFrontMatter,
      project: "uNews",
      series: "unews",
      title: "Плохое время",
      repo_url: "https://github.com/sunpole/uNews",
      image_text: undefined,
      queued_at: "2026-07-18 15:40",
    },
    body: "Короткий текст.",
    expected: "Invalid queued_at",
  },
  {
    name: "valid Russian uSugar",
    shouldPass: true,
    frontMatter: validUsugarFrontMatter,
    body: "Короткий текст для Telegram:\nДокументационное обновление uSugar: карта задач обновлена, ссылки и правила публикации проверены.",
    assert(policy) {
      if (!policy.captionText.includes("#uSugar #тыСахар #uNews #Sunpole")) {
        throw new Error("valid uSugar caption has no required hashtags");
      }
      if (!policy.captionText.includes("https://github.com/sunpole/uSugar")) {
        throw new Error("valid uSugar caption has no required link");
      }
      if (!/документационное обновление/i.test(policy.captionText)) {
        throw new Error("valid uSugar caption has no type-aware wording");
      }
    },
  },
  {
    name: "English-only uSugar fails",
    shouldPass: false,
    frontMatter: {
      ...validUsugarFrontMatter,
      title: "Runtime hotfix",
      image_text: "uSugar runtime hotfix settings menu smart text input",
    },
    body: "Short text for Telegram:\nRuntime hotfix for startup and settings menu.",
    expected: "meaningful Russian",
  },
  {
    name: "uSugar mojibake fails",
    shouldPass: false,
    frontMatter: {
      ...validUsugarFrontMatter,
      title: "РљР°СЂС‚Р° Р·Р°РґР°С‡",
      image_text: "uSugar РљР°СЂС‚Р° Р·Р°РґР°С‡",
    },
    body: "Короткий текст для Telegram:\nРљР°СЂС‚Р° Р·Р°РґР°С‡ uSugar РѕР±РЅРѕРІР»РµРЅР°.",
    expected: "Broken/mojibake",
  },
  {
    name: "uSugar question marks fail",
    shouldPass: false,
    frontMatter: {
      ...validUsugarFrontMatter,
      image_text: "uSugar OCR ???? menu",
    },
    body: "Короткий текст для Telegram:\nОбновление uSugar содержит ???? и не должно пройти.",
    expected: "Broken/mojibake",
  },
  {
    name: "uSugar missing image_text fails",
    shouldPass: false,
    frontMatter: {
      type: "docs",
      project: "uSugar",
      series: "usugar",
      title: "Карта задач",
      version: "1.5.2",
      queued_at: "2026-07-18T15:40:00Z",
      repo_url: "https://github.com/sunpole/uSugar",
      image: "safe.png",
    },
    body: "Короткий текст для Telegram:\nДокументационное обновление uSugar с русским текстом.",
    expected: "Missing image_text",
  },
  {
    name: "missing version",
    shouldPass: false,
    frontMatter: {
      type: "docs",
      project: "uNews",
      series: "unews",
      title: "Без версии",
      repo_url: "https://github.com/sunpole/uNews",
      image: "safe.png",
    },
    body: "Short text.",
    expected: "Missing required field: version",
  },
  {
    name: "generic public project mapping",
    shouldPass: true,
    frontMatter: {
      type: "patch",
      project: "Unknown Project",
      series: "unknown",
      title: "Unknown",
      version: "0.1.0",
      queued_at: "2026-07-18T15:40:00Z",
      repo_url: "https://github.com/sunpole/unknown",
      image: "safe.png",
    },
    body: "Short text.",
    assert(policy) {
      if (!policy.captionText.includes("#unknown #uNews #тыНовости #Sunpole")) {
        throw new Error("generic project caption has no generated hashtags");
      }
    },
  },
  {
    name: "missing link",
    shouldPass: false,
    frontMatter: {
      type: "patch",
      project: "uNews",
      series: "unews",
      title: "No link",
      version: "0.1.0",
      queued_at: "2026-07-18T15:40:00Z",
      image: "safe.png",
    },
    body: "Short text.",
    expected: "Missing usable link",
  },
  {
    name: "missing image",
    shouldPass: false,
    frontMatter: {
      type: "patch",
      project: "uNews",
      series: "unews",
      title: "No image",
      version: "0.1.0",
      queued_at: "2026-07-18T15:40:00Z",
      repo_url: "https://github.com/sunpole/uNews",
    },
    body: "Short text.",
    expected: "Missing image/images",
  },
  {
    name: "secret-like text",
    shouldPass: false,
    frontMatter: {
      type: "patch",
      project: "uNews",
      series: "unews",
      title: "Secret",
      version: "0.1.0",
      queued_at: "2026-07-18T15:40:00Z",
      repo_url: "https://github.com/sunpole/uNews",
      image: "safe.png",
    },
    body: "Do not publish TELEGRAM_BOT_TOKEN in release notes.",
    expected: "Secret-like text detected",
  },
  {
    name: "manual Telegram link is rejected",
    shouldPass: false,
    frontMatter: {
      type: "patch",
      project: "uNews",
      series: "unews",
      title: "Duplicate link",
      version: "0.3.11",
      queued_at: "2026-08-11T12:00:00Z",
      repo_url: "https://github.com/sunpole/uNews",
      image: "safe.png",
    },
    body: "Patch text.\n\n\u0421\u0441\u044b\u043b\u043a\u0430: https://sunpole.github.io/uNews/",
    expected: "Manual URL detected",
  },
  {
    name: "manual Telegram hashtags are rejected",
    shouldPass: false,
    frontMatter: {
      type: "patch",
      project: "uNews",
      series: "unews",
      title: "Duplicate hashtags",
      version: "0.3.11",
      queued_at: "2026-08-11T12:00:00Z",
      repo_url: "https://github.com/sunpole/uNews",
      image: "safe.png",
    },
    body: "Patch text.\n\n#uNews #\u0442\u044b\u041d\u043e\u0432\u043e\u0441\u0442\u0438 #Sunpole",
    expected: "Manual hashtag footer detected",
  },
  {
    name: "labelled manual Telegram hashtags are rejected",
    shouldPass: false,
    frontMatter: {
      type: "patch",
      project: "uNews",
      series: "unews",
      title: "Duplicate labelled hashtags",
      version: "0.3.12",
      queued_at: "2026-08-11T12:00:00Z",
      repo_url: "https://github.com/sunpole/uNews",
      image: "safe.png",
    },
    body: "Patch text.\n\n\u0425\u044d\u0448\u0442\u0435\u0433\u0438: #uNews #\u0442\u044b\u041d\u043e\u0432\u043e\u0441\u0442\u0438 #Sunpole",
    expected: "Manual hashtag footer detected",
  },
  {
    name: "GitHub credential-like text",
    shouldPass: false,
    frontMatter: {
      type: "patch",
      project: "uNews",
      series: "unews",
      title: "Credential",
      version: "0.1.0",
      queued_at: "2026-07-18T15:40:00Z",
      repo_url: "https://github.com/sunpole/uNews",
      image: "safe.png",
    },
    body: `Accidental credential: ${["ghp", "A".repeat(36)].join("_")}`,
    expected: "Secret-like text detected: GitHub token",
  },
  {
    name: "assigned credential-like text",
    shouldPass: false,
    frontMatter: {
      type: "patch",
      project: "uNews",
      series: "unews",
      title: "Credential assignment",
      version: "0.1.0",
      queued_at: "2026-07-18T15:40:00Z",
      repo_url: "https://github.com/sunpole/uNews",
      image: "safe.png",
    },
    body: `api_key=${"A".repeat(24)}`,
    expected: "Secret-like text detected: assigned credential",
  },
  {
    name: "uSugar medical/private risk",
    shouldPass: false,
    frontMatter: validUsugarFrontMatter,
    body: "Короткий текст для Telegram:\nПроверка содержит chat_id и не должна пройти публикацию.",
    expected: "uSugar private/medical risk detected",
  },
];

let failures = 0;

for (const fixture of fixtures) {
  const policy = buildPublicationPolicy({
    frontMatter: fixture.frontMatter,
    body: fixture.body,
  });

  try {
    if (fixture.shouldPass && !policy.ok) {
      throw new Error(policy.errors.join("; "));
    }

    if (!fixture.shouldPass && policy.ok) {
      throw new Error("fixture passed but should have failed");
    }

    if (!fixture.shouldPass && fixture.expected && !policy.errors.some((error) => error.includes(fixture.expected))) {
      throw new Error(`expected error containing "${fixture.expected}", got: ${policy.errors.join("; ")}`);
    }

    if (fixture.assert) fixture.assert(policy);
    console.log(`OK ${fixture.name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${fixture.name}: ${error.message}`);
  }
}

if (failures > 0) {
  process.exit(1);
}
