import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const outputDir = path.join(root, "artifacts/release");
const screenshotName = "unews-v0-3-8-telegram-photo-normalization.png";
const screenshotPath = path.join(outputDir, screenshotName);
const url = "http://127.0.0.1:4173/";
const commit = process.env.SCREENSHOT_COMMIT || "local-uncommitted";

await mkdir(outputDir, { recursive: true });

const server = spawn("python3", ["-m", "http.server", "4173", "--bind", "127.0.0.1"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});

async function waitForServer() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Local uNews release page did not start");
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.goto(url, { waitUntil: "networkidle" });

  const target = page.locator("#telegram-photo-normalization");
  await target.waitFor({ state: "visible", timeout: 30_000 });
  const text = await target.innerText();
  for (const expected of [
    "uNews 0.3.8",
    "1440 × 8625",
    "≤ 9800 px",
    "≤ 10 МБ",
    "Не изменяется",
  ]) {
    if (!text.includes(expected)) throw new Error(`Release proof is missing ${JSON.stringify(expected)}`);
  }

  await target.screenshot({ path: screenshotPath });
  const box = await target.boundingBox();
  if (!box || box.width < 600 || box.height < 300) {
    throw new Error(`Unexpected release screenshot bounds: ${JSON.stringify(box)}`);
  }

  const manifest = {
    schemaVersion: 1,
    project: "uNews",
    version: "0.3.8",
    commit,
    capturedAt: new Date().toISOString(),
    url,
    selector: "#telegram-photo-normalization",
    screenshot: screenshotName,
    viewport: { width: 1280, height: 1000 },
    bounds: box,
    assertions: [
      "uNews 0.3.8",
      "1440 × 8625",
      "≤ 9800 px",
      "≤ 10 МБ",
      "Не изменяется",
    ],
  };
  await writeFile(
    path.join(outputDir, "release-screenshot.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
