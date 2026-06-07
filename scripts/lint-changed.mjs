#!/usr/bin/env bun

import { spawnSync } from "node:child_process";

const BASE = process.env.LINT_BASE_REF ?? "origin/main";

function git(args) {
  const res = spawnSync("git", args, { encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() : "";
}

spawnSync("git", ["fetch", "--quiet", "origin", BASE.replace(/^origin\//, "")], {
  stdio: "ignore",
});

const mergeBase = git(["merge-base", BASE, "HEAD"]);
if (!mergeBase) {
  console.log(
    `lint:changed: no merge-base with ${BASE}; skipping (run "bun run lint" for full tree)`,
  );
  process.exit(0);
}

const diff = git(["diff", "--name-only", "--diff-filter=ACMR", mergeBase, "HEAD"]);
const files = diff
  .split("\n")
  .map((f) => f.trim())
  .filter((f) => /\.(ts|tsx|mjs)$/.test(f));

if (files.length === 0) {
  console.log("lint:changed: no TS/JS files changed versus base; nothing to lint");
  process.exit(0);
}

console.log(`lint:changed: linting ${files.length} changed file(s)`);
const eslint = spawnSync("eslint", ["--max-warnings=0", ...files], {
  stdio: "inherit",
});
process.exit(eslint.status ?? 1);
