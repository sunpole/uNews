#!/usr/bin/env node

import { buildPublicationPolicy } from "./patchnote-policy.js";

const fixtures = [
  {
    name: "valid uSugar",
    shouldPass: true,
    frontMatter: {
      type: "docs",
      project: "uSugar",
      series: "usugar",
      title: "Карта задач",
      repo_url: "https://github.com/sunpole/uSugar",
      image: "safe.png",
    },
    body: "Короткий текст для Telegram:\nКарта задач uSugar обновлена.",
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
    name: "unknown project mapping",
    shouldPass: false,
    frontMatter: {
      type: "patch",
      project: "Unknown Project",
      series: "unknown",
      title: "Unknown",
      repo_url: "https://github.com/sunpole/unknown",
      image: "safe.png",
    },
    body: "Short text.",
    expected: "Unknown hashtag mapping",
  },
  {
    name: "missing link",
    shouldPass: false,
    frontMatter: {
      type: "patch",
      project: "uNews",
      series: "unews",
      title: "No link",
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
      repo_url: "https://github.com/sunpole/uNews",
      image: "safe.png",
    },
    body: "Do not publish TELEGRAM_BOT_TOKEN in release notes.",
    expected: "Secret-like text detected",
  },
  {
    name: "uSugar medical/private risk",
    shouldPass: false,
    frontMatter: {
      type: "docs",
      project: "uSugar",
      series: "usugar",
      title: "Risk",
      repo_url: "https://github.com/sunpole/uSugar",
      image: "safe.png",
    },
    body: "Короткий текст для Telegram:\nПроверка содержит chat_id и не должна пройти.",
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
