import fs from "node:fs";
import path from "node:path";
import { encryptRecordsSnapshot } from "./encrypt-records-data";

const keyPath = path.join(process.cwd(), ".site-access-key");

function readKey(): string {
  const fromEnv = process.env.SITE_ACCESS_KEY?.trim();
  if (fromEnv) return fromEnv;
  if (fs.existsSync(keyPath)) {
    const existing = fs.readFileSync(keyPath, "utf8").trim();
    if (existing) return existing;
  }
  throw new Error("缺少 SITE_ACCESS_KEY / .site-access-key，無法加密代調堂紀錄");
}

encryptRecordsSnapshot(readKey()).catch((err) => {
  console.error(err);
  process.exit(1);
});
