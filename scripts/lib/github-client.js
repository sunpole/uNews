const DEFAULT_API = "https://api.github.com";

export function createGitHubClient({ token = "", apiBase = DEFAULT_API } = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "uNews-publisher",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  async function getJson(url) {
    const response = await fetch(url, { headers });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub request failed ${response.status}: ${safeGitHubUrl(url)}`);
    return response.json();
  }

  async function getText(url) {
    const response = await fetch(url, { headers });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub text request failed ${response.status}: ${safeGitHubUrl(url)}`);
    return response.text();
  }

  async function discoverPublicProjects(config) {
    const projects = [];
    const seen = new Set();
    const owner = config.owner || "sunpole";
    const exclude = new Set(config.exclude || []);

    for (const project of config.manualProjects || []) {
      const metadata = await getJson(`${apiBase}/repos/${project.repo}`);
      if (!metadata || metadata.private || metadata.archived || metadata.owner?.login !== owner) continue;
      projects.push({ ...project, branch: project.branch || metadata.default_branch || "main" });
      seen.add(project.repo);
    }

    let page = 1;
    while (true) {
      const repos = await getJson(`${apiBase}/users/${owner}/repos?per_page=100&page=${page}&sort=updated`);
      if (!repos?.length) break;
      for (const repo of repos) {
        const fullName = repo.full_name;
        if (repo.private || repo.archived || exclude.has(fullName) || seen.has(fullName)) continue;
        projects.push({
          name: repo.name,
          repo: fullName,
          branch: repo.default_branch || config.defaultBranchFallback || "main",
          newsDir: config.newsDir || "news",
        });
        seen.add(fullName);
      }
      page += 1;
    }
    return projects;
  }

  async function listNewsFiles(project) {
    const [owner, repo] = project.repo.split("/");
    const branch = project.branch || "main";
    const newsDir = project.newsDir || "news";
    const url = `${apiBase}/repos/${owner}/${repo}/contents/${encodeURIComponent(newsDir)}?ref=${encodeURIComponent(branch)}`;
    const entries = await getJson(url);
    if (!Array.isArray(entries)) return [];
    return entries
      .filter((entry) => entry.type === "file" && entry.name.endsWith(".md"))
      .map((entry) => ({
        project,
        name: entry.name,
        path: entry.path,
        downloadUrl: entry.download_url,
        key: `${project.repo}|${branch}|${entry.path}`,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  return { discoverPublicProjects, getJson, getText, listNewsFiles };
}

function safeGitHubUrl(url) {
  const parsed = new URL(url);
  parsed.searchParams.delete("access_token");
  return parsed.toString();
}
