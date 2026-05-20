import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const requiredFiles = [
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "LICENSE",
  "manifest.xml.example",
  "deployment/config/prod.env.example",
  "SOLUTION.md",
];

const forbiddenFiles = ["deployment/config/prod.env", "manifest.xml"];
const forbiddenDirs = ["dist", "backend/dist", "node_modules", ".tmp"];
const forbiddenPatterns = [
  /GLEAN_OAUTH_CLIENT_SECRET=.+\S/,
  /AWS_SECRET_ACCESS_KEY/,
  /BEGIN PRIVATE KEY/,
  /glean_api_token/i,
];
const forbiddenSourcePatterns = [
  /console\.log\(/,
  /console\.debug\(/,
  /glean_chat_response_shape/,
  /glean_excel_debug/,
];

let failed = false;

function isGitTracked(file) {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", file], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function gitAvailable() {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    stdio: "ignore",
  });
  return result.status === 0;
}

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

for (const file of requiredFiles) {
  try {
    await access(file, constants.R_OK);
  } catch {
    console.error(`Missing required file: ${file}`);
    failed = true;
  }
}

for (const file of forbiddenFiles) {
  try {
    await access(file, constants.R_OK);
    if (isGitTracked(file)) {
      console.error(`Generated or secret-bearing file is tracked and must be removed: ${file}`);
      failed = true;
    }
  } catch {
    // Expected.
  }
}

if (gitAvailable()) {
  for (const dir of forbiddenDirs) {
    const result = spawnSync("git", ["ls-files", dir], { encoding: "utf8" });
    if (result.stdout.trim()) {
      console.error(`Generated or dependency directory is tracked and must be removed: ${dir}`);
      failed = true;
    }
  }
}

for (const file of ["deployment/config/prod.env.example", "README.md", "SOLUTION.md"]) {
  try {
    const text = await readFile(file, "utf8");
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(text)) {
        console.error(`Forbidden pattern ${pattern} found in ${file}`);
        failed = true;
      }
    }
  } catch {
    // Required-file check reports missing files.
  }
}

for (const dir of ["src", "backend/src"]) {
  let files;
  try {
    files = await walkFiles(dir);
  } catch {
    continue;
  }
  for (const file of files) {
    if (!/\.(ts|tsx|js|mjs)$/.test(file)) continue;
    const text = await readFile(file, "utf8");
    for (const pattern of forbiddenSourcePatterns) {
      if (pattern.test(text)) {
        console.error(`Forbidden debug pattern ${pattern} found in ${file}`);
        failed = true;
      }
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log("Public-readiness checks passed.");
