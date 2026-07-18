#!/usr/bin/env node

import { buildPublicationPolicy } from "./patchnote-policy.js";

const validUsugarFrontMatter = {
  type: "docs",
  project: "uSugar",
  series: "usugar",
  title: "Карта задач",
  version: "1.5.2",
  repo_url: "https://github.com/sunpole/uSugar",
  image: "safe.png",
  image_text: "uSugar карта задач документационное обновление без приватных данных",
};

const fixtures = [
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
      repo_url: "https://github.com/sunpole/uNews",
      image: "safe.png",
    },
    body: "Do not publish TELEGRAM_BOT_TOKEN in release notes.",
    expected: "Secret-like text detected",
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
