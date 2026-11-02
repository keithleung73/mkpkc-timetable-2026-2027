import { decryptUtf8, isEncryptedBlob, readStoredAccessCode } from "./site-access";
import { loadCoverStore, saveCoverStore, saveSwapStore } from "./browser-records";
import { parseRecordsFile, type ParsedRecordsFile } from "./records-file";
import { isStaticExport, recordsDataUrl } from "./runtime";

export const RECORDS_SNAPSHOT_META_KEY = "mkpkc.recordsSnapshotMeta.v1";

export type RecordsSnapshotMeta = {
  publishedAt: string;
};

let hydratePromise: Promise<void> | null = null;

export function publishedRecordsAreEmpty(file: ParsedRecordsFile): boolean {
  return (
    Object.keys(file.balances).length === 0 && file.plans.length === 0 && file.swaps.length === 0
  );
}

/** Apply a newly published snapshot once; keep local edits until the next publish. */
export function shouldApplyPublishedSnapshot(
  publishedAt: string,
  lastAppliedAt: string | null,
  publishedEmpty: boolean,
): boolean {
  if (publishedEmpty) return false;
  if (!lastAppliedAt) return true;
  return Boolean(publishedAt) && publishedAt > lastAppliedAt;
}

function readMeta(): RecordsSnapshotMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RECORDS_SNAPSHOT_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecordsSnapshotMeta;
    return typeof parsed.publishedAt === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeMeta(meta: RecordsSnapshotMeta) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECORDS_SNAPSHOT_META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

function applySnapshot(file: ParsedRecordsFile) {
  saveCoverStore({ balances: file.balances, plans: file.plans });
  saveSwapStore({ swaps: file.swaps });
  writeMeta({ publishedAt: file.exportedAt ?? new Date().toISOString() });
}

async function loadPublishedRecords(): Promise<ParsedRecordsFile | null> {
  const code = readStoredAccessCode();
  if (!code) return null;
  const res = await fetch(recordsDataUrl(), { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("無法載入網上版代調堂紀錄");
  const blob = await res.json();
  if (!isEncryptedBlob(blob)) return null;
  const plain = await decryptUtf8(blob, code);
  const parsed = parseRecordsFile(JSON.parse(plain), { allowEmpty: true });
  if ("error" in parsed) return null;
  return parsed;
}

async function hydrateOnce() {
  if (!isStaticExport) return;
  const published = await loadPublishedRecords();
  if (!published) return;
  const meta = readMeta();
  if (
    shouldApplyPublishedSnapshot(
      published.exportedAt ?? "",
      meta?.publishedAt ?? null,
      publishedRecordsAreEmpty(published),
    )
  ) {
    applySnapshot(published);
  }
}

/** GitHub Pages 無共用伺服器：用發布時加密嘅紀錄檔填每位瀏覽器嘅結餘。 */
export function hydratePublishedRecords(): Promise<void> {
  if (!isStaticExport) return Promise.resolve();
  if (!hydratePromise) {
    hydratePromise = hydrateOnce().catch((err) => {
      hydratePromise = null;
      throw err;
    });
  }
  return hydratePromise;
}

export function _resetPublishedRecordsHydrationForTests() {
  hydratePromise = null;
}
