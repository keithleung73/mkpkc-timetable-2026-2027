import { dayLabel, periodLabel } from "./constants";
import { addDaysIso, mondayOfWeekIso, weekdayFromIsoDate } from "./cover";
import type { SavedCoverPlan } from "./cover";
import { coverWeight } from "./homeroom";
import { leaveKindLabel, type LeaveKind } from "./leave";
import type { ConfirmedSwap } from "./swap-records";
import { swapModeLabel } from "./swap-rules";

export type RecordRangeKind = "day" | "week" | "month" | "custom";

export type DateRange = {
  start: string;
  end: string;
};

export type TeacherRecordKind = "swap" | "cover";

export type TeacherRecordRole = "leave" | "partner" | "absentee" | "cover" | "uncovered";

export type TeacherRecordRow = {
  id: string;
  kind: TeacherRecordKind;
  date: string;
  periodId: string;
  periodText: string;
  teacherId: string;
  teacherName: string;
  role: TeacherRecordRole;
  roleLabel: string;
  leaveKind?: LeaveKind;
  subjects: string[];
  classIds: string[];
  counterpartName: string;
  detail: string;
};

export function monthStartIso(iso: string): string {
  const [y, m] = iso.split("-");
  if (!y || !m) return iso;
  return `${y}-${m}-01`;
}

export function monthEndIso(iso: string): string {
  const [ys, ms] = iso.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!y || !m) return iso;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return addDaysIso(next, -1);
}

export function dateInRange(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

export function rangeFromPreset(
  kind: RecordRangeKind,
  anchor: string,
  customStart?: string,
  customEnd?: string,
): DateRange {
  if (kind === "custom") {
    const start = customStart && customStart <= (customEnd || customStart) ? customStart : customEnd || anchor;
    const end = customEnd && customEnd >= (customStart || customEnd) ? customEnd : customStart || anchor;
    return { start: start || anchor, end: end || anchor };
  }
  if (kind === "week") {
    const start = mondayOfWeekIso(anchor);
    return { start, end: addDaysIso(start, 4) };
  }
  if (kind === "month") {
    return { start: monthStartIso(anchor), end: monthEndIso(anchor) };
  }
  return { start: anchor, end: anchor };
}

export function rangeLabel(kind: RecordRangeKind, range: DateRange): string {
  if (kind === "day") return range.start;
  if (kind === "week") return `${range.start} 至 ${range.end}（該星期一至五）`;
  if (kind === "month") return `${range.start.slice(0, 7)}（${range.start} 至 ${range.end}）`;
  return `${range.start} 至 ${range.end}`;
}

function swapPeriodText(swap: ConfirmedSwap, side: "leave" | "partner"): string {
  if (swap.periodPairs?.length) {
    const ids =
      side === "leave"
        ? swap.periodPairs.map((p) => p.leavePeriodId)
        : swap.periodPairs.map((p) => p.partnerPeriodId);
    return ids.map((id) => periodLabel(id)).join("＋");
  }
  return periodLabel(side === "leave" ? swap.leavePeriodId : swap.partnerPeriodId);
}

function pushSwapRows(
  out: TeacherRecordRow[],
  swap: ConfirmedSwap,
  teacherId: string | null,
  range: DateRange,
) {
  const leaveTouches = !teacherId || swap.leaveTeacherId === teacherId;
  const partnerTouches = !teacherId || swap.partnerTeacherIds.includes(teacherId);
  if (!leaveTouches && !partnerTouches) return;

  const mode = swapModeLabel(swap.mode);
  const kindText = swap.leaveKind ? leaveKindLabel(swap.leaveKind) : "";

  if (leaveTouches && dateInRange(swap.leaveDate, range)) {
    out.push({
      id: `${swap.id}|leave|${swap.leaveDate}`,
      kind: "swap",
      date: swap.leaveDate,
      periodId: swap.leavePeriodId,
      periodText: swapPeriodText(swap, "leave"),
      teacherId: swap.leaveTeacherId,
      teacherName: swap.leaveTeacherName,
      role: "leave",
      roleLabel: "調出／請假",
      leaveKind: swap.leaveKind,
      subjects: swap.leaveSubjects,
      classIds: swap.leaveClassIds,
      counterpartName: swap.partnerTeacherNames.join("、") || "空堂／CLP",
      detail: [kindText, mode, swap.reason].filter(Boolean).join(" · "),
    });
  }

  if (leaveTouches && swap.partnerDate !== swap.leaveDate && dateInRange(swap.partnerDate, range)) {
    out.push({
      id: `${swap.id}|leave-in|${swap.partnerDate}`,
      kind: "swap",
      date: swap.partnerDate,
      periodId: swap.partnerPeriodId,
      periodText: swapPeriodText(swap, "partner"),
      teacherId: swap.leaveTeacherId,
      teacherName: swap.leaveTeacherName,
      role: "leave",
      roleLabel: "調入",
      leaveKind: swap.leaveKind,
      subjects: swap.leaveSubjects,
      classIds: swap.leaveClassIds,
      counterpartName: swap.partnerTeacherNames.join("、") || "空堂／CLP",
      detail: [kindText, mode, `對調至 ${swap.partnerDate}`, swap.reason].filter(Boolean).join(" · "),
    });
  }

  if (partnerTouches && swap.partnerTeacherIds.length > 0 && dateInRange(swap.partnerDate, range)) {
    const names = swap.partnerTeacherNames.join("、") || swap.partnerTeacherIds.join("、");
    const ids = swap.partnerTeacherIds.length ? swap.partnerTeacherIds : [""];
    const wanted = teacherId ? ids.filter((id) => id === teacherId) : ids;
    for (const id of wanted.length ? wanted : [swap.partnerTeacherIds[0] ?? ""]) {
      const name =
        swap.partnerTeacherNames[swap.partnerTeacherIds.indexOf(id)] ?? (names || "對手老師");
      out.push({
        id: `${swap.id}|partner|${swap.partnerDate}|${id}`,
        kind: "swap",
        date: swap.partnerDate,
        periodId: swap.partnerPeriodId,
        periodText: swapPeriodText(swap, "partner"),
        teacherId: id,
        teacherName: name,
        role: "partner",
        roleLabel: "對手調出",
        leaveKind: swap.leaveKind,
        subjects: swap.partnerSubjects,
        classIds: swap.partnerClassIds,
        counterpartName: swap.leaveTeacherName,
        detail: [kindText, mode, swap.reason].filter(Boolean).join(" · "),
      });
    }
  }

  if (
    partnerTouches &&
    swap.partnerTeacherIds.length > 0 &&
    swap.leaveDate !== swap.partnerDate &&
    dateInRange(swap.leaveDate, range)
  ) {
    const ids = swap.partnerTeacherIds.length ? swap.partnerTeacherIds : [""];
    const wanted = teacherId ? ids.filter((id) => id === teacherId) : ids;
    for (const id of wanted.length ? wanted : [swap.partnerTeacherIds[0] ?? ""]) {
      const name =
        swap.partnerTeacherNames[swap.partnerTeacherIds.indexOf(id)] ??
        (swap.partnerTeacherNames.join("、") || "對手老師");
      out.push({
        id: `${swap.id}|partner-in|${swap.leaveDate}|${id}`,
        kind: "swap",
        date: swap.leaveDate,
        periodId: swap.leavePeriodId,
        periodText: swapPeriodText(swap, "leave"),
        teacherId: id,
        teacherName: name,
        role: "partner",
        roleLabel: "對手調入",
        leaveKind: swap.leaveKind,
        subjects: swap.partnerSubjects,
        classIds: swap.partnerClassIds,
        counterpartName: swap.leaveTeacherName,
        detail: [kindText, mode, `調入 ${swap.leaveDate}`, swap.reason].filter(Boolean).join(" · "),
      });
    }
  }
}

function pushCoverRows(
  out: TeacherRecordRow[],
  plan: SavedCoverPlan,
  teacherId: string | null,
  range: DateRange,
) {
  if (!dateInRange(plan.date, range)) return;

  for (const a of plan.assignments) {
    const kind = plan.leaveKinds?.[a.absenteeId];
    if (!teacherId || a.absenteeId === teacherId) {
      out.push({
        id: `${plan.id}|absentee|${a.periodId}|${a.absenteeId}`,
        kind: "cover",
        date: plan.date,
        periodId: a.periodId,
        periodText: periodLabel(a.periodId),
        teacherId: a.absenteeId,
        teacherName: a.absenteeName,
        role: "absentee",
        roleLabel: "請假由人代",
        leaveKind: kind,
        subjects: [a.subject],
        classIds: a.classIds,
        counterpartName: a.coverTeacherName,
        detail: [leaveKindLabel(kind), a.reason].filter(Boolean).join(" · "),
      });
    }
    if (!teacherId || a.coverTeacherId === teacherId) {
      out.push({
        id: `${plan.id}|cover|${a.periodId}|${a.coverTeacherId}`,
        kind: "cover",
        date: plan.date,
        periodId: a.periodId,
        periodText: periodLabel(a.periodId),
        teacherId: a.coverTeacherId,
        teacherName: a.coverTeacherName,
        role: "cover",
        roleLabel: "代人上堂",
        leaveKind: kind,
        subjects: [a.subject],
        classIds: a.classIds,
        counterpartName: a.absenteeName,
        detail: [leaveKindLabel(kind), a.reason].filter(Boolean).join(" · "),
      });
    }
  }

  for (const slot of plan.leftover) {
    if (teacherId && slot.teacherId !== teacherId) continue;
    const kind = plan.leaveKinds?.[slot.teacherId];
    out.push({
      id: `${plan.id}|leftover|${slot.periodId}|${slot.teacherId}`,
      kind: "cover",
      date: plan.date,
      periodId: slot.periodId,
      periodText: periodLabel(slot.periodId),
      teacherId: slot.teacherId,
      teacherName: slot.teacherName,
      role: "uncovered",
      roleLabel: "未編配代堂",
      leaveKind: kind,
      subjects: [slot.subject],
      classIds: slot.classIds,
      counterpartName: "—",
      detail: [leaveKindLabel(kind), "該節未找到代堂"].filter(Boolean).join(" · "),
    });
  }
}

export function collectTeacherRecords(
  swaps: ConfirmedSwap[],
  plans: SavedCoverPlan[],
  teacherId: string | null,
  range: DateRange,
  kind: "all" | TeacherRecordKind = "all",
): TeacherRecordRow[] {
  const out: TeacherRecordRow[] = [];
  if (kind !== "cover") {
    for (const swap of swaps) pushSwapRows(out, swap, teacherId, range);
  }
  if (kind !== "swap") {
    for (const plan of plans) pushCoverRows(out, plan, teacherId, range);
  }
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.periodId.localeCompare(b.periodId) ||
      a.kind.localeCompare(b.kind) ||
      a.teacherName.localeCompare(b.teacherName, "zh-Hant"),
  );
}

export function summarizeTeacherRecords(rows: TeacherRecordRow[]) {
  const covering = rows.filter((r) => r.role === "cover");
  const absentee = rows.filter((r) => r.role === "absentee");
  return {
    total: rows.length,
    swap: rows.filter((r) => r.kind === "swap").length,
    cover: rows.filter((r) => r.kind === "cover").length,
    leave: rows.filter((r) => r.role === "leave").length,
    partner: rows.filter((r) => r.role === "partner").length,
    absentee: absentee.length,
    covering: covering.length,
    uncovered: rows.filter((r) => r.role === "uncovered").length,
    coveringPeriods: covering.reduce((sum, r) => sum + coverWeight(r.periodId), 0),
    absenteePeriods: absentee.reduce((sum, r) => sum + coverWeight(r.periodId), 0),
  };
}

export function teacherRecordSheetRows(rows: TeacherRecordRow[]): string[][] {
  const header = [
    "老師",
    "日期",
    "星期",
    "種類",
    "角色",
    "請假種類",
    "節次",
    "代堂節數",
    "科目",
    "班",
    "對手",
    "說明",
  ];
  const body = rows.map((r) => {
    const day = weekdayFromIsoDate(r.date);
    return [
      r.teacherName,
      r.date,
      day ? dayLabel(day) : "",
      r.kind === "swap" ? "調堂" : "代堂",
      r.roleLabel,
      r.leaveKind ? leaveKindLabel(r.leaveKind) : "",
      r.periodText,
      r.kind === "cover" ? String(coverWeight(r.periodId)) : "",
      r.subjects.join("、"),
      r.classIds.join("、"),
      r.counterpartName,
      r.detail,
    ];
  });
  return [header, ...body];
}

export function teacherRecordsFilename(
  teacherName: string | null,
  range: DateRange,
  ext: "xlsx" | "csv",
): string {
  const who = teacherName?.replace(/\s+/g, "") || "全部老師";
  return `代調記錄_${who}_${range.start}_${range.end}.${ext}`;
}
