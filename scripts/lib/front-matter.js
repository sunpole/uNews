export function parsePatchnote(source, label = "patchnote") {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error(`Patchnote has no YAML front matter: ${label}`);
  return { frontMatter: parseSimpleYaml(match[1]), body: match[2].trim() };
}

export function parseSimpleYaml(yamlSource) {
  const result = {};
  let currentArrayKey = null;

  for (const rawLine of yamlSource.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const item = rawLine.match(/^\s*-\s*(.+?)\s*$/);
    if (item && currentArrayKey) {
      result[currentArrayKey].push(stripQuotes(item[1].trim()));
      continue;
    }

    const kv = rawLine.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!kv) {
      currentArrayKey = null;
      continue;
    }

    const key = kv[1];
    const value = (kv[2] || "").trim();
    if (!value) {
      result[key] = [];
      currentArrayKey = key;
    } else {
      result[key] = stripQuotes(value);
      currentArrayKey = null;
    }
  }

  return result;
}

export function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
