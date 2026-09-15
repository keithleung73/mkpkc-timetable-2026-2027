import fs from "node:fs";
import path from "node:path";
import { encryptUtf8, randomAccessKey } from "../src/lib/site-access";

const root = process.cwd();
const keyPath = path.join(root, ".site-access-key");
const src = path.join(root, "data", "schedule.json");
const dest = path.join(root, "data", "schedule.enc.json");

function readKey(): string {
  const fromEnv = process.env.SITE_ACCESS_KEY?.trim();
  if (fromEnv) return fromEnv;
  if (fs.existsSync(keyPath)) {
    const existing = fs.readFileSync(keyPath, "utf8").trim();
    if (existing) return existing;
  }
  const created = randomAccessKey();
  fs.writeFileSync(keyPath, `${created}\n`, { encoding: "utf8", mode: 0o600 });
  return created;
}

async function main() {
  if (!fs.existsSync(src)) {
    throw new Error("找不到 data/schedule.json，無法加密。請先喺學務部電腦保留明文課表。");
  }

  const key = readKey();
  const blob = await encryptUtf8(fs.readFileSync(src, "utf8"), key);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${JSON.stringify(blob, null, 2)}\n`);
  console.log("wrote data/schedule.enc.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
