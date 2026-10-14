import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { SavedSwapRecord } from "./swap-records";

const DATA_PATH = path.join(process.cwd(), "data", "swaps.json");

export type SwapStore = {
  swaps: SavedSwapRecord[];
};

function emptyStore(): SwapStore {
  return { swaps: [] };
}

function ensureDir() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function readSwapStore(): SwapStore {
  ensureDir();
  if (!fs.existsSync(DATA_PATH)) return emptyStore();
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) as SwapStore;
    return { swaps: Array.isArray(raw.swaps) ? raw.swaps : [] };
  } catch {
    return emptyStore();
  }
}

export function writeSwapStore(store: SwapStore) {
  ensureDir();
  fs.writeFileSync(
    DATA_PATH,
    JSON.stringify({ swaps: store.swaps.slice(0, 200) }, null, 2),
    "utf8",
  );
}
