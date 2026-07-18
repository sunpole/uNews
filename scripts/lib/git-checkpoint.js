import { execFileSync } from "node:child_process";
import process from "node:process";

function git(args, options = {}) {
  return execFileSync("git", args, { encoding: "utf8", stdio: options.quiet ? "ignore" : "inherit" });
}

export function checkpointPublishedState(key) {
  if (process.env.UNEWS_GIT_CHECKPOINT !== "1") return false;

  git(["add", "--", "data/published.json"]);
  try {
    git(["diff", "--cached", "--quiet"], { quiet: true });
    return false;
  } catch (error) {
    if (error.status !== 1) throw error;
  }

  git(["commit", "-m", `Record published uNews item: ${key}`]);
  try {
    git(["push", "origin", "HEAD:main"]);
  } catch {
    console.log("Checkpoint push raced with another main update; rebasing once.");
    git(["pull", "--rebase", "origin", "main"]);
    git(["push", "origin", "HEAD:main"]);
  }
  console.log(`Checkpointed published state to GitHub: ${key}.`);
  return true;
}
