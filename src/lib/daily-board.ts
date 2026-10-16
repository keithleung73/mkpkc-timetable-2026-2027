import { periodLabel } from "./constants";
import {
  absenteesOnDate,
  coverPlanOnDate,
  isCoverWaived,
  slotsToCover,
  weekdayFromIsoDate,
  type CoverAssignment,
  type CoverSlot,
  type SavedCoverPlan,
} from "./cover";
import { leaveKindLabel, type LeaveKind } from "./leave";
import { schoolClosedReason } from "./school-calendar";
import { teacherMatchScore } from "./search";
import { buildLeaveUnits } from "./swap";
import { applyConfirmedSwaps, swapRecordKey, swapsAffectingDate, type ConfirmedSwap } from "./swap-records";
import type { ScheduleData, Teacher } from "./types";

export const DAILY_ROSTER_STORAGE_KEY = "mkpkc.dailyRoster.v1";

export type HandleStatus = "done" | "partial" | "none" | "na";

export type DailyAbsenteeRow = {
  teacherId: string;
  teacherName: string;
  teacherCode: string;
  leaveKind?: LeaveKind;
  leaveKindLabel: string;
  cover: HandleStatus;
  swap: HandleStatus;
  coverDone: number;
  coverLeft: number;
  swapDone: number;
  swapLeft: number;
  coverLeftPeriods: string[];
  swapLeftPeriods: string[];
  overall: "done" | "open";
};

export type DailyArrangementLine = {
  id: string;
  kind: "swap-leave" | "swap-in" | "cover" | "leftover";
  periodId: string;
  title: string;
  detail: string;
};

const SWAPABLE_UNIT = new Set(["normal", "ial_bundle", "subject_pair"]);

export function handleStatusLabel(status: HandleStatus): string {
  if (status === "done") return "已處理";
  if (status === "partial") return "部分未處理";
  if (status === "none") return "未處理";
  return "無需";
}

export function parseDailyRosterStore(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [date, ids] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!Array.isArray(ids)) continue;
    out[date] = [...new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean))];
  }
  return out;
}

export function loadDailyRoster(date: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = parseDailyRosterStore(JSON.parse(localStorage.getItem(DAILY_ROSTER_STORAGE_KEY) ?? "{}"));
    return parsed[date] ?? [];
  } catch {
    return [];
  }
}

export function saveDailyRoster(date: string, ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    const parsed = parseDailyRosterStore(JSON.parse(localStorage.getItem(DAILY_ROSTER_STORAGE_KEY) ?? "{}"));
    const next = [...new Set(ids.filter(Boolean))];
    if (next.length === 0) delete parsed[date];
    else parsed[date] = next;
    localStorage.setItem(DAILY_ROSTER_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore quota / private mode */
  }
}

export function splitAbsenteeTokens(raw: string): string[] {
  return raw
    .split(/[\s,，、;；/|]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function resolveAbsenteeTokens(
  teachers: Teacher[],
  raw: string,
): { ids: string[]; unmatched: string[] } {
  const ids: string[] = [];
  const unmatched: string[] = [];
  for (const token of splitAbsenteeTokens(raw)) {
    const ranked = teachers
      .map((t) => ({ t, score: teacherMatchScore(t, token) }))
      .filter((x) => x.score >= 70)
      .sort((a, b) => b.score - a.score || a.t.name.localeCompare(b.t.name, "zh-Hant"));
    const best = ranked[0];
    const second = ranked[1];
    if (best && (!second || best.score > second.score || best.t.id === second.t.id)) {
      ids.push(best.t.id);
    } else {
      unmatched.push(token);
    }
  }
  return { ids: [...new Set(ids)], unmatched };
}

export function mergeRosterIds(
  date: string,
  typed: string[],
  plans: SavedCoverPlan[],
  swaps: ConfirmedSwap[],
): string[] {
  const known = absenteesOnDate(date, plans, swaps);
  return [...new Set([...typed, ...known])];
}

function statusFromCounts(done: number, left: number): HandleStatus {
  if (done === 0 && left === 0) return "na";
  if (left === 0) return "done";
  if (done === 0) return "none";
  return "partial";
}

function swapPeriodDone(
  teacherId: string,
  date: string,
  periodId: string,
  swaps: ConfirmedSwap[],
  plan: SavedCoverPlan | null,
): boolean {
  const key = swapRecordKey({ leaveTeacherId: teacherId, leaveDate: date, leavePeriodId: periodId });
  if (swaps.some((s) => swapRecordKey(s) === key)) return true;
  return Boolean(
    plan?.assignments.some((a) => a.absenteeId === teacherId && a.periodId === periodId),
  );
}

export function dailyAbsenteeRows(
  data: ScheduleData,
  date: string,
  absenteeIds: string[],
  plans: SavedCoverPlan[],
  swaps: ConfirmedSwap[],
): DailyAbsenteeRow[] {
  const day = weekdayFromIsoDate(date);
  const closed = schoolClosedReason(date);
  const plan = coverPlanOnDate(plans, date);
  const effective = applyConfirmedSwaps(data, date, swaps);

  return [...new Set(absenteeIds)]
    .map((id) => {
      const teacher = data.teachers.find((t) => t.id === id);
      const leaveKind = plan?.leaveKinds?.[id];
      if (!day || closed) {
        return {
          teacherId: id,
          teacherName: teacher?.name ?? id,
          teacherCode: teacher?.code ?? id,
          leaveKind,
          leaveKindLabel: leaveKindLabel(leaveKind),
          cover: "na" as const,
          swap: "na" as const,
          coverDone: 0,
          coverLeft: 0,
          swapDone: 0,
          swapLeft: 0,
          coverLeftPeriods: [],
          swapLeftPeriods: [],
          overall: "done" as const,
        };
      }

      const slots = slotsToCover(effective, day, [id]);
      const leftover = (plan?.leftover ?? []).filter((s) => s.teacherId === id);
      const assignments = (plan?.assignments ?? []).filter((a) => a.absenteeId === id);
      const plannedPeriods = new Set([
        ...leftover.map((s) => s.periodId),
        ...assignments.map((a) => a.periodId),
      ]);
      const extraUnplanned = plan ? slots.filter((s) => !plannedPeriods.has(s.periodId)) : slots;
      const coverDone = plan ? assignments.length : 0;
      const coverLeft = plan ? leftover.length + extraUnplanned.length : slots.length;
      const coverLeftPeriods = [
        ...leftover.map((s) => s.periodId),
        ...extraUnplanned.map((s) => s.periodId),
      ];

      const units = buildLeaveUnits(data, id, [date]).filter((u) => SWAPABLE_UNIT.has(u.kind));
      const swapPeriods = [...new Set(units.map((u) => u.periodId))];
      const swapLeftPeriods = swapPeriods.filter((periodId) => !swapPeriodDone(id, date, periodId, swaps, plan));
      const swapDone = swapPeriods.length - swapLeftPeriods.length;
      const swapLeft = swapLeftPeriods.length;

      const cover = statusFromCounts(coverDone, coverLeft);
      const swap = statusFromCounts(swapDone, swapLeft);
      return {
        teacherId: id,
        teacherName: teacher?.name ?? id,
        teacherCode: teacher?.code ?? id,
        leaveKind,
        leaveKindLabel: leaveKindLabel(leaveKind),
        cover,
        swap,
        coverDone,
        coverLeft,
        swapDone,
        swapLeft,
        coverLeftPeriods: [...new Set(coverLeftPeriods)],
        swapLeftPeriods,
        overall:
          cover === "none" || cover === "partial" || swap === "none" || swap === "partial"
            ? ("open" as const)
            : ("done" as const),
      };
    })
    .sort((a, b) => {
      if (a.overall !== b.overall) return a.overall === "open" ? -1 : 1;
      return a.teacherName.localeCompare(b.teacherName, "zh-Hant");
    });
}

function assignmentDetail(a: CoverAssignment): string {
  const who = isCoverWaived(a)
    ? "不適用"
    : a.combine
      ? `合班 ${a.coverTeacherName}`
      : `代堂 ${a.coverTeacherName}`;
  return `${who} · ${a.subject} ${a.classIds.join("、")}${a.absenteeName ? `（代 ${a.absenteeName}）` : ""}`;
}

function leftoverDetail(s: CoverSlot): string {
  return `未編 · ${s.subject} ${s.classIds.join("、")}（${s.teacherName}）`;
}

export function dailyArrangementLines(
  date: string,
  plans: SavedCoverPlan[],
  swaps: ConfirmedSwap[],
): DailyArrangementLine[] {
  const plan = coverPlanOnDate(plans, date);
  const lines: DailyArrangementLine[] = [];
  for (const s of swapsAffectingDate(swaps, date)) {
    if (s.leaveDate === date) {
      lines.push({
        id: `swap-leave-${s.id}`,
        kind: "swap-leave",
        periodId: s.leavePeriodId,
        title: `${periodLabel(s.leavePeriodId)} 調出`,
        detail: `${s.leaveTeacherName} ${s.leaveSubjects.join("、")} ${s.leaveClassIds.join("、")} → ${s.partnerDate} ${periodLabel(s.partnerPeriodId)} ${s.partnerTeacherNames.join("、")}`,
      });
    }
    if (s.partnerDate === date) {
      lines.push({
        id: `swap-in-${s.id}`,
        kind: "swap-in",
        periodId: s.partnerPeriodId,
        title: `${periodLabel(s.partnerPeriodId)} 調入`,
        detail: `${s.partnerTeacherNames.join("、") || "對手"} ${s.partnerSubjects.join("、")} ${s.partnerClassIds.join("、")} ← ${s.leaveTeacherName}（${s.leaveDate} ${periodLabel(s.leavePeriodId)}）`,
      });
    }
  }
  for (const a of plan?.assignments ?? []) {
    lines.push({
      id: `cover-${plan?.id ?? date}-${a.periodId}-${a.absenteeId}-${a.coverTeacherId}`,
      kind: "cover",
      periodId: a.periodId,
      title: `${periodLabel(a.periodId)} 代堂`,
      detail: assignmentDetail(a),
    });
  }
  for (const s of plan?.leftover ?? []) {
    lines.push({
      id: `left-${plan?.id ?? date}-${s.periodId}-${s.teacherId}-${s.subject}`,
      kind: "leftover",
      periodId: s.periodId,
      title: `${periodLabel(s.periodId)} 未編`,
      detail: leftoverDetail(s),
    });
  }
  const order = new Map(
    ["hr", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"].map((id, i) => [id, i]),
  );
  return lines.sort(
    (a, b) =>
      (order.get(a.periodId) ?? 99) - (order.get(b.periodId) ?? 99) || a.title.localeCompare(b.title, "zh-Hant"),
  );
}

export function dailySummary(rows: DailyAbsenteeRow[], lines: DailyArrangementLine[]) {
  return {
    roster: rows.length,
    open: rows.filter((r) => r.overall === "open").length,
    done: rows.filter((r) => r.overall === "done").length,
    swaps: lines.filter((l) => l.kind === "swap-leave" || l.kind === "swap-in").length,
    covers: lines.filter((l) => l.kind === "cover").length,
    leftover: lines.filter((l) => l.kind === "leftover").length,
  };
}
