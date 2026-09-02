import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { CoverBalances, SavedCoverPlan } from "./cover";

const DATA_PATH = path.join(process.cwd(), "data", "cover.json");

export type CoverStore = {
  balances: CoverBalances;
  plans: SavedCoverPlan[];
};

function emptyStore(): CoverStore {
  return { balances: {}, plans: [] };
}

function ensureDir() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function readCoverStore(): CoverStore {
  ensureDir();
  if (!fs.existsSync(DATA_PATH)) return emptyStore();
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) as CoverStore;
    return {
      balances: raw.balances ?? {},
      plans: Array.isArray(raw.plans) ? raw.plans : [],
    };
  } catch {
    return emptyStore();
  }
}

export function writeCoverStore(store: CoverStore) {
  ensureDir();
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), "utf8");
}
