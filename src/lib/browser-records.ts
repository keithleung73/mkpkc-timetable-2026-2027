import type { CoverBalances, SavedCoverPlan } from "./cover";
import type { ConfirmedSwap, SwapStoreData } from "./swap-records";

const SWAP_KEY = "mkpkc.swaps.v1";
const COVER_KEY = "mkpkc.cover.v1";

export type CoverStoreData = {
  balances: CoverBalances;
  plans: SavedCoverPlan[];
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadSwapStore(): SwapStoreData {
  const raw = readJson<SwapStoreData>(SWAP_KEY, { swaps: [] });
  return { swaps: Array.isArray(raw.swaps) ? raw.swaps : [] };
}

export function saveSwapStore(store: SwapStoreData) {
  writeJson(SWAP_KEY, { swaps: store.swaps.slice(0, 200) });
}

export function loadCoverStore(): CoverStoreData {
  const raw = readJson<CoverStoreData>(COVER_KEY, { balances: {}, plans: [] });
  return {
    balances: raw.balances ?? {},
    plans: Array.isArray(raw.plans) ? raw.plans : [],
  };
}

export function saveCoverStore(store: CoverStoreData) {
  writeJson(COVER_KEY, {
    balances: store.balances,
    plans: store.plans.slice(0, 80),
  });
}
