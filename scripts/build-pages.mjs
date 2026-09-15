/**
 * Build static site for GitHub Pages.
 * Temporarily moves API routes aside (unsupported by next export).
 * Ships encrypted timetable only — plaintext schedule.json never goes to gh-pages.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const apiDir = path.join(root, "src", "app", "api");
const apiPark = path.join(root, "src", "app", "_api_parked_for_pages");
const publicData = path.join(root, "public", "data");
const scheduleSrc = path.join(root, "data", "schedule.json");
const scheduleEnc = path.join(root, "data", "schedule.enc.json");
const scheduleDest = path.join(publicData, "schedule.enc.json");
const plaintextDest = path.join(publicData, "schedule.json");
const keyFile = path.join(root, ".site-access-key");

const basePath = "/mkpkc-timetable-2026-2027";

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited ${r.status}`);
  }
}

if (fs.existsSync(scheduleSrc) && (process.env.SITE_ACCESS_KEY || fs.existsSync(keyFile))) {
  run("npx", ["tsx", "scripts/encrypt-schedule.ts"]);
}

if (!fs.existsSync(scheduleEnc)) {
  throw new Error("missing data/schedule.enc.json — run npm run encrypt-data on the office PC first");
}

fs.mkdirSync(publicData, { recursive: true });
fs.copyFileSync(scheduleEnc, scheduleDest);
if (fs.existsSync(plaintextDest)) fs.rmSync(plaintextDest);
console.log("copied data/schedule.enc.json -> public/data/schedule.enc.json");

const nextDir = path.join(root, ".next");
if (fs.existsSync(nextDir)) {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log("cleared .next for a clean static export");
}

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
  const outDir = path.join(root, "out");
  fs.writeFileSync(path.join(outDir, ".nojekyll"), "");
  const indexHtml = path.join(outDir, "index.html");
  if (fs.existsSync(indexHtml)) {
    fs.copyFileSync(indexHtml, path.join(outDir, "404.html"));
  }
  const leaked = path.join(outDir, "data", "schedule.json");
  if (fs.existsSync(leaked)) fs.rmSync(leaked);
  if (!fs.existsSync(path.join(outDir, "data", "schedule.enc.json"))) {
    throw new Error("static export missing encrypted timetable");
  }
  console.log("static export ready in ./out");
} finally {
  if (parked && fs.existsSync(apiPark)) {
    if (fs.existsSync(apiDir)) {
      fs.rmSync(apiDir, { recursive: true, force: true });
    }
    fs.renameSync(apiPark, apiDir);
    console.log("restored src/app/api");
  }
}
