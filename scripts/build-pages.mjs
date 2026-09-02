/**
 * Build static site for GitHub Pages.
 * Temporarily moves API routes aside (unsupported by next export).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const apiDir = path.join(root, "src", "app", "api");
const apiPark = path.join(root, "src", "app", "_api_parked_for_pages");
const publicData = path.join(root, "public", "data");
const scheduleSrc = path.join(root, "data", "schedule.json");
const scheduleDest = path.join(publicData, "schedule.json");

const basePath = "/mkpkc-timetable-2026-2027";

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

fs.mkdirSync(publicData, { recursive: true });
fs.copyFileSync(scheduleSrc, scheduleDest);
console.log("copied data/schedule.json -> public/data/schedule.json");

let parked = false;
if (fs.existsSync(apiDir)) {
  if (fs.existsSync(apiPark)) {
    fs.rmSync(apiPark, { recursive: true, force: true });
  }
  fs.renameSync(apiDir, apiPark);
  parked = true;
  console.log("parked src/app/api for static export");
}

try {
  run("npx", ["next", "build"], {
    GITHUB_PAGES: "true",
    NEXT_PUBLIC_STATIC: "true",
    NEXT_PUBLIC_BASE_PATH: basePath,
  });
} finally {
  if (parked && fs.existsSync(apiPark)) {
    if (fs.existsSync(apiDir)) {
      fs.rmSync(apiDir, { recursive: true, force: true });
    }
    fs.renameSync(apiPark, apiDir);
    console.log("restored src/app/api");
  }
}

console.log("static export ready in ./out");
