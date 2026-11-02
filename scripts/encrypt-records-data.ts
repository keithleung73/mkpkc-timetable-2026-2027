import fs from "node:fs";
import path from "node:path";
import { encryptUtf8 } from "../src/lib/site-access";
import { buildRecordsFile } from "../src/lib/records-file";
import type { CoverBalances, SavedCoverPlan } from "../src/lib/cover";
import type { ConfirmedSwap } from "../src/lib/swap-records";

const root = process.cwd();
export const coverSrc = path.join(root, "data", "cover.json");
export const swapSrc = path.join(root, "data", "swaps.json");
export const recordsDest = path.join(root, "data", "records.enc.json");

function readJsonFile<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function encryptRecordsSnapshot(key: string) {
  const cover = readJsonFile<{ balances?: CoverBalances; plans?: SavedCoverPlan[] }>(coverSrc, {
    balances: {},
    plans: [],
  });
  const swap = readJsonFile<{ swaps?: ConfirmedSwap[] }>(swapSrc, { swaps: [] });
  const balances = cover.balances ?? {};
  const plans = Array.isArray(cover.plans) ? cover.plans : [];
  const swaps = Array.isArray(swap.swaps) ? swap.swaps : [];
  if (Object.keys(balances).length === 0 && plans.length === 0 && swaps.length === 0) {
    console.log("skip records.enc.json (no local cover/swap records)");
    return false;
  }
  const file = buildRecordsFile(balances, plans, swaps);
  const recordsBlob = await encryptUtf8(JSON.stringify(file), key);
  fs.writeFileSync(recordsDest, `${JSON.stringify(recordsBlob, null, 2)}\n`);
  console.log("wrote data/records.enc.json");
  return true;
}
