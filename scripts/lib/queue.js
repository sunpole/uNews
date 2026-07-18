const VERSION_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+]([0-9A-Za-z.-]+))?$/;

export function parseQueuedAt(value) {
  if (!value) return null;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;

  for (let index = 0; index < 3; index += 1) {
    if (a.parts[index] !== b.parts[index]) return a.parts[index] - b.parts[index];
  }
  if (a.pre === b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  return a.pre.localeCompare(b.pre, "en", { numeric: true });
}

export function isSemanticVersion(value) {
  return Boolean(parseVersion(value));
}

export function cooldownRemainingMs(details, now = Date.now(), intervalMs = 9 * 60 * 1000) {
  const timestamps = Object.values(details || {})
    .map((entry) => Date.parse(entry?.published_at || ""))
    .filter(Number.isFinite);
  if (!timestamps.length) return 0;
  return Math.max(0, Math.max(...timestamps) + intervalMs - now);
}

export function orderProjectQueue(items) {
  return [...items].sort((a, b) => {
    const versionOrder = compareVersions(a.frontMatter?.version, b.frontMatter?.version);
    if (versionOrder !== 0) return versionOrder;
    const timeOrder = String(a.queuedAt).localeCompare(String(b.queuedAt));
    return timeOrder || a.key.localeCompare(b.key);
  });
}

export function selectQueueHead(items) {
  const byProject = new Map();
  for (const item of items) {
    const projectKey = item.project.repo;
    if (!byProject.has(projectKey)) byProject.set(projectKey, []);
    byProject.get(projectKey).push(item);
  }

  const readyHeads = [];
  const blocked = [];
  for (const [project, projectItems] of byProject) {
    const ordered = orderProjectQueue(projectItems);
    const head = ordered[0];
    if (head.errors?.length) {
      blocked.push({ project, key: head.key, version: head.frontMatter?.version || null, errors: head.errors });
    } else {
      readyHeads.push(head);
    }
  }

  readyHeads.sort((a, b) => String(a.queuedAt).localeCompare(String(b.queuedAt)) || a.key.localeCompare(b.key));
  return { selected: readyHeads[0] || null, readyHeads, blocked };
}

function parseVersion(value) {
  const match = String(value || "").trim().match(VERSION_RE);
  if (!match) return null;
  return {
    parts: [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)],
    pre: match[4] || "",
  };
}
