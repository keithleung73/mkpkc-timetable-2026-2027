import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { ConfirmedSwap, SwapStoreData } from "./swap-records";

const DATA_PATH = path.join(process.cwd(), "data", "swaps.json");

function emptyStore(): SwapStoreData {
  return { swaps: [] };
}

function ensureDir() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function readSwapStore(): SwapStoreData {
  ensureDir();
  if (!fs.existsSync(DATA_PATH)) return emptyStore();
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) as SwapStoreData;
    return { swaps: Array.isArray(raw.swaps) ? raw.swaps : [] };
  } catch {
    return emptyStore();
  }
}

export function writeSwapStore(store: SwapStoreData) {
  ensureDir();
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), "utf8");
}

export function addConfirmedSwap(swap: ConfirmedSwap) {
  const store = readSwapStore();
  writeSwapStore({ swaps: [swap, ...store.swaps].slice(0, 200) });
  return readSwapStore();
}

export function writeConfirmedSwaps(swaps: ConfirmedSwap[]) {
  writeSwapStore({ swaps });
  return readSwapStore();
}

export function removeConfirmedSwap(id: string): { store: SwapStoreData; removed?: ConfirmedSwap } {
  const store = readSwapStore();
  const removed = store.swaps.find((s) => s.id === id);
  if (!removed) return { store };
  const next = { swaps: store.swaps.filter((s) => s.id !== id) };
  writeSwapStore(next);
  return { store: next, removed };
}
