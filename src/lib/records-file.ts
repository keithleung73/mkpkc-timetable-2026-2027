import type { CoverBalances, SavedCoverPlan } from "./cover";
import { applyBalances } from "./cover";
import type { ConfirmedSwap } from "./swap-records";

export const RECORDS_FILE_KIND = "mkpkc-cover-swap-records";
export const RECORDS_FILE_VERSION = 1;

export type CoverSwapRecordsFile = {
  v: typeof RECORDS_FILE_VERSION;
  kind: typeof RECORDS_FILE_KIND;
  exportedAt: string;
  balances: CoverBalances;
  plans: SavedCoverPlan[];
  swaps: ConfirmedSwap[];
};

export type ParsedRecordsFile = {
  balances: CoverBalances;
  plans: SavedCoverPlan[];
  swaps: ConfirmedSwap[];
  exportedAt?: string;
};

const DAYS = new Set(["mon", "tue", "wed", "thu", "fri"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((x) => String(x ?? "")).filter(Boolean) : [];
}

function looksLikeIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sanitizeBalances(raw: unknown): CoverBalances {
  if (!isRecord(raw)) return {};
  const out: CoverBalances = {};
  for (const [id, n] of Object.entries(raw)) {
    if (!id) continue;
    const num = typeof n === "number" ? n : Number(n);
    if (Number.isFinite(num)) out[id] = num;
  }
  return out;
}

function sanitizePlan(raw: unknown, index: number): SavedCoverPlan | null {
  if (!isRecord(raw)) return null;
  const date = asString(raw.date);
  const day = asString(raw.day);
  if (!looksLikeIsoDate(date) || !DAYS.has(day)) return null;
  const assignments = Array.isArray(raw.assignments) ? raw.assignments : [];
  const leftover = Array.isArray(raw.leftover) ? raw.leftover : [];
  const slots = Array.isArray(raw.slots) ? raw.slots : [];
  const absentees = asStringArray(raw.absentees);
  return {
    ...(raw as unknown as SavedCoverPlan),
    id: asString(raw.id) || `cover-${date}-import-${index}`,
    confirmedAt: asString(raw.confirmedAt) || new Date().toISOString(),
    date,
    day: day as SavedCoverPlan["day"],
    absentees,
    assignments: assignments as SavedCoverPlan["assignments"],
    leftover: leftover as SavedCoverPlan["leftover"],
    slots: slots as SavedCoverPlan["slots"],
  };
}

function sanitizeSwap(raw: unknown, index: number): ConfirmedSwap | null {
  if (!isRecord(raw)) return null;
  const leaveDate = asString(raw.leaveDate);
  const partnerDate = asString(raw.partnerDate);
  const leaveDay = asString(raw.leaveDay);
  const partnerDay = asString(raw.partnerDay);
  const leaveTeacherId = asString(raw.leaveTeacherId);
  const leavePeriodId = asString(raw.leavePeriodId);
  const partnerPeriodId = asString(raw.partnerPeriodId);
  if (!leaveTeacherId || !looksLikeIsoDate(leaveDate) || !looksLikeIsoDate(partnerDate)) return null;
  if (!leavePeriodId || !partnerPeriodId) return null;
  if (leaveDay && !DAYS.has(leaveDay)) return null;
  if (partnerDay && !DAYS.has(partnerDay)) return null;
  return {
    ...(raw as unknown as ConfirmedSwap),
    id: asString(raw.id) || `swap-import-${leaveDate}-${index}`,
    confirmedAt: asString(raw.confirmedAt) || new Date().toISOString(),
    leaveTeacherId,
    leaveTeacherName: asString(raw.leaveTeacherName) || leaveTeacherId,
    leaveDate,
    leaveDay: (DAYS.has(leaveDay) ? leaveDay : "mon") as ConfirmedSwap["leaveDay"],
    leavePeriodId,
    leaveLessonIds: asStringArray(raw.leaveLessonIds),
    leaveSubjects: asStringArray(raw.leaveSubjects),
    leaveClassIds: asStringArray(raw.leaveClassIds),
    partnerDate,
    partnerDay: (DAYS.has(partnerDay) ? partnerDay : "mon") as ConfirmedSwap["partnerDay"],
    partnerPeriodId,
    partnerTeacherIds: asStringArray(raw.partnerTeacherIds),
    partnerTeacherNames: asStringArray(raw.partnerTeacherNames),
    partnerLessonIds: asStringArray(raw.partnerLessonIds),
    partnerSubjects: asStringArray(raw.partnerSubjects),
    partnerClassIds: asStringArray(raw.partnerClassIds),
    reason: asString(raw.reason) || "上存紀錄",
  };
}

export function buildRecordsFile(
  balances: CoverBalances,
  plans: SavedCoverPlan[],
  swaps: ConfirmedSwap[],
  exportedAt = new Date().toISOString(),
): CoverSwapRecordsFile {
  return {
    v: RECORDS_FILE_VERSION,
    kind: RECORDS_FILE_KIND,
    exportedAt,
    balances: { ...balances },
    plans: [...plans],
    swaps: [...swaps],
  };
}

export function isExcelUploadName(name: string): boolean {
  return /\.(xlsx|xls|xlsm)$/i.test(name.trim());
}

export function isJsonUploadName(name: string): boolean {
  return /\.json$/i.test(name.trim());
}

export function recordsFileName(exportedAt = new Date().toISOString()): string {
  const day = exportedAt.slice(0, 10) || "export";
  return `萬鈞伯裘書院-代調堂記錄-${day}.json`;
}

export function parseRecordsFile(raw: unknown): ParsedRecordsFile | { error: string } {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { error: "呢個檔唔係有效嘅 JSON" };
    }
  }
  if (!isRecord(raw)) return { error: "呢個檔唔似代調堂紀錄" };
  if (raw.kind && raw.kind !== RECORDS_FILE_KIND) {
    return { error: "呢個檔唔係本系統嘅代調堂紀錄檔" };
  }
  const plans = (Array.isArray(raw.plans) ? raw.plans : [])
    .map((p, i) => sanitizePlan(p, i))
    .filter((p): p is SavedCoverPlan => Boolean(p))
    .slice(0, 80);
  const swaps = (Array.isArray(raw.swaps) ? raw.swaps : [])
    .map((s, i) => sanitizeSwap(s, i))
    .filter((s): s is ConfirmedSwap => Boolean(s))
    .slice(0, 200);
  if (plans.length === 0 && swaps.length === 0) {
    return { error: "檔案沒有可上存嘅代堂或調堂紀錄" };
  }
  return {
    balances: sanitizeBalances(raw.balances),
    plans,
    swaps,
    exportedAt: asString(raw.exportedAt) || undefined,
  };
}

export function recordsFileSummary(file: ParsedRecordsFile) {
  const coverAssignments = file.plans.reduce((n, p) => n + p.assignments.length, 0);
  return {
    coverDays: file.plans.length,
    coverAssignments,
    swaps: file.swaps.length,
    balanceTeachers: Object.keys(file.balances).length,
    exportedAt: file.exportedAt,
  };
}

export function replaceRecordsFromFile(file: ParsedRecordsFile): ParsedRecordsFile {
  const plans = file.plans.slice(0, 80);
  const swaps = file.swaps.slice(0, 200);
  const hasBalances = Object.keys(file.balances).length > 0;
  const balances = hasBalances
    ? { ...file.balances }
    : plans.reduce((acc, plan) => applyBalances(acc, plan), {} as CoverBalances);
  return { balances, plans, swaps, exportedAt: file.exportedAt };
}

export function downloadRecordsFile(file: CoverSwapRecordsFile) {
  const blob = new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = recordsFileName(file.exportedAt);
  a.click();
  URL.revokeObjectURL(url);
}
