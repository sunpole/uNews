#!/usr/bin/env node

import { buildPublicationPolicy } from "./patchnote-policy.js";

const baseAuditFrontMatter = {
  type: "audit",
  project: "uDream",
  series: "udream",
  title: "Data quality audit",
  version: "23.8.10",
  queued_at: "2026-07-23T09:40:00Z",
  repo_url: "https://github.com/sunpole/udream",
  image: "safe.png",
};

const auditWithoutKeyword = buildPublicationPolicy({
  frontMatter: baseAuditFrontMatter,
  body: "Короткий текст для Telegram:\nПроверена структура данных, источники и качество записей перед следующей публикацией.",
});

if (!auditWithoutKeyword.ok) {
  throw new Error(`audit type should pass policy: ${auditWithoutKeyword.errors.join("; ")}`);
}

if (!auditWithoutKeyword.captionText.startsWith("Аудит.")) {
  throw new Error("audit type should receive an automatic audit prefix when the short text does not mention audit/report wording");
}

if (!auditWithoutKeyword.captionText.includes("#uDream #тыСон #uNews #Sunpole")) {
  throw new Error("audit caption should keep uDream hashtags");
}

const auditWithKeyword = buildPublicationPolicy({
  frontMatter: baseAuditFrontMatter,
  body: "Короткий текст для Telegram:\nАудит качества данных uDream завершён, найденные замечания описаны в патчноуте.",
});

if (!auditWithKeyword.ok) {
  throw new Error(`audit type with explicit wording should pass policy: ${auditWithKeyword.errors.join("; ")}`);
}

if (auditWithKeyword.captionText.startsWith("Аудит. Аудит")) {
  throw new Error("audit type should not duplicate explicit audit wording");
}

console.log("OK audit patchnote policy");
