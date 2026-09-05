import { addDaysIso, weekdayFromIsoDate } from "./cover";
import type { LeaveKind } from "./leave";
import { isClpSubject, isRemedialLesson, isTeachingLesson } from "./lesson-kind";
import { isSwapAllowedDate, swapBlockedReason, swapPairError } from "./school-calendar";
import {
  exceedsSameSubjectSwapLimit,
  roomsFreeForMove,
  type SwapMode,
  type SwapPeriodPair,
} from "./swap-rules";
import type { DayId, Lesson, ScheduleData } from "./types";

export type ConfirmedSwap = {
  id: string;
  confirmedAt: string;
  leaveTeacherId: string;
  leaveTeacherName: string;
  leaveDate: string;
  leaveDay: DayId;
  leavePeriodId: string;
  leaveLessonIds: string[];
  leaveSubjects: string[];
  leaveClassIds: string[];
  partnerDate: string;
  partnerDay: DayId;
  partnerPeriodId: string;
  partnerTeacherIds: string[];
  partnerTeacherNames: string[];
  partnerLessonIds: string[];
  partnerSubjects: string[];
  partnerClassIds: string[];
  reason: string;
  leaveKind?: LeaveKind;
  mode?: SwapMode;
  periodPairs?: SwapPeriodPair[];
};

export type SwapStoreData = {
  swaps: ConfirmedSwap[];
};

/** 由指定日起搵下一個上課日（可排除請假日） */
export function resolveDateForWeekday(
  fromIso: string,
  day: DayId,
  excludeDates: Iterable<string> = [],
): string | null {
  const exclude = new Set(excludeDates);
  let d = fromIso;
  for (let i = 0; i < 28; i++) {
    if (weekdayFromIsoDate(d) === day && !exclude.has(d) && isSwapAllowedDate(d)) return d;
    d = addDaysIso(d, 1);
  }
  return null;
}

/** 由調堂開始日起列出可對調嘅上課日（含下一兩個星期同一曜日） */
export function swapSearchDates(swapFromDate: string, leaveDates: string[], days = 21): string[] {
  const leave = new Set(leaveDates);
  const out: string[] = [];
  let d = swapFromDate;
  for (let i = 0; i < days; i++) {
    if (isSwapAllowedDate(d) && !leave.has(d)) out.push(d);
    d = addDaysIso(d, 1);
  }
  return out;
}

function teacherName(data: ScheduleData, id: string) {
  return data.teachers.find((t) => t.id === id)?.name ?? id;
}

function regularLessonsAt(
  data: ScheduleData,
  teacherId: string,
  day: DayId,
  periodId: string,
): Lesson[] {
  return data.lessons.filter(
    (l) =>
      isTeachingLesson(l) &&
      l.day === day &&
      l.periodId === periodId &&
      l.teacherIds.includes(teacherId),
  );
}

export function swapRecordKey(s: Pick<ConfirmedSwap, "leaveTeacherId" | "leaveDate" | "leavePeriodId">) {
  return `${s.leaveTeacherId}|${s.leaveDate}|${s.leavePeriodId}`;
}

export function swapConflicts(existing: ConfirmedSwap[], next: ConfirmedSwap): string | null {
  const nextTeachers = new Set([next.leaveTeacherId, ...next.partnerTeacherIds]);
  const nextSlots = [
    `${next.leaveDate}|${next.leavePeriodId}`,
    `${next.partnerDate}|${next.partnerPeriodId}`,
  ];
  for (const s of existing) {
    if (s.id === next.id) continue;
    if (swapRecordKey(s) === swapRecordKey(next)) {
      return "呢節已有調堂紀錄";
    }
    const teachers = new Set([s.leaveTeacherId, ...s.partnerTeacherIds]);
    const slots = [`${s.leaveDate}|${s.leavePeriodId}`, `${s.partnerDate}|${s.partnerPeriodId}`];
    for (const slot of slots) {
      if (!nextSlots.includes(slot)) continue;
      for (const id of teachers) {
        if (nextTeachers.has(id)) {
          return `${teacherLabel(s)} 喺 ${slot.replace("|", " ")} 已有調堂`;
        }
      }
    }
  }
  return null;
}

function teacherLabel(s: ConfirmedSwap) {
  return s.leaveTeacherName;
}

export function makeConfirmedSwap(partial: Omit<ConfirmedSwap, "id" | "confirmedAt">): ConfirmedSwap {
  return {
    ...partial,
    id: `swap-${partial.leaveDate}-${partial.leavePeriodId}-${partial.leaveTeacherId}-${Date.now()}`,
    confirmedAt: new Date().toISOString(),
  };
}

export function confirmedSwapFromSuggestion(
  data: ScheduleData,
  leaveTeacherId: string,
  leaveDate: string,
  leavePeriodId: string,
  leaveLessons: Lesson[],
  partnerDate: string,
  partnerDay: DayId,
  partnerPeriodId: string,
  partnerLessons: Lesson[],
  reason: string,
  leaveKind?: LeaveKind,
  mode?: SwapMode,
  periodPairs?: SwapPeriodPair[],
): ConfirmedSwap | { error: string } {
  const leaveDay = weekdayFromIsoDate(leaveDate);
  const partnerWeekday = weekdayFromIsoDate(partnerDate);
  if (!leaveDay) return { error: "請假日唔係上課日" };
  const leaveBlock = swapBlockedReason(leaveDate);
  if (leaveBlock) return { error: leaveBlock };
  if (!partnerWeekday || partnerWeekday !== partnerDay) {
    return { error: "調往日期同星期唔對" };
  }
  const partnerBlock = swapBlockedReason(partnerDate);
  if (partnerBlock) return { error: partnerBlock };
  if (leaveDate === partnerDate && leavePeriodId === partnerPeriodId) {
    return { error: "調往節次唔可以同原節次一樣" };
  }
  if (leaveLessons.some(isRemedialLesson) || partnerLessons.filter((l) => !isClpSubject(l.subject)).some(isRemedialLesson)) {
    return { error: "重摘課不能調堂" };
  }
  const resolvedMode: SwapMode =
    mode ??
    (partnerLessons.length > 0 && partnerLessons.every((l) => isClpSubject(l.subject))
      ? "clp"
      : "period");
  if (resolvedMode !== "split_rotate") {
    const ignore = new Set([...leaveLessons, ...partnerLessons].map((l) => l.id));
    const pairs = periodPairs?.length
      ? periodPairs
      : [{ leavePeriodId, partnerPeriodId }];
    for (const pair of pairs) {
      const movingLeave = leaveLessons.filter((l) => !periodPairs?.length || l.periodId === pair.leavePeriodId);
      const movingPartner = partnerLessons.filter(
        (l) => !isClpSubject(l.subject) && (!periodPairs?.length || l.periodId === pair.partnerPeriodId),
      );
      if (!roomsFreeForMove(data, movingLeave, partnerDay, pair.partnerPeriodId, ignore)) {
        return { error: "調往節次課室已被佔用" };
      }
      if (!roomsFreeForMove(data, movingPartner, leaveDay, pair.leavePeriodId, ignore)) {
        return { error: "原節次課室已被佔用" };
      }
    }
    if (exceedsSameSubjectSwapLimit(leaveLessons) || (periodPairs?.length ?? 0) > 2) {
      return { error: "同一科不能一次過調 4 堂或以上" };
    }
  }
  const leaveTeacher = data.teachers.find((t) => t.id === leaveTeacherId);
  const partnerTeacherIds = [...new Set(partnerLessons.flatMap((l) => l.teacherIds))];
  return makeConfirmedSwap({
    leaveTeacherId,
    leaveTeacherName: leaveTeacher?.name ?? leaveTeacherId,
    leaveDate,
    leaveDay,
    leavePeriodId,
    leaveLessonIds: leaveLessons.map((l) => l.id),
    leaveSubjects: [...new Set(leaveLessons.map((l) => l.subject))],
    leaveClassIds: [...new Set(leaveLessons.flatMap((l) => l.classIds))],
    partnerDate,
    partnerDay,
    partnerPeriodId,
    partnerTeacherIds,
    partnerTeacherNames: partnerTeacherIds.map((id) => teacherName(data, id)),
    partnerLessonIds: partnerLessons.map((l) => l.id),
    partnerSubjects: [...new Set(partnerLessons.map((l) => l.subject))],
    partnerClassIds: [...new Set(partnerLessons.flatMap((l) => l.classIds))],
    reason,
    leaveKind,
    mode: resolvedMode,
    periodPairs,
  });
}

export type ManualSwapInput = {
  leaveTeacherId: string;
  leaveDate: string;
  leavePeriodId: string;
  partnerDate: string;
  partnerPeriodId: string;
  partnerTeacherId?: string;
  leaveKind?: LeaveKind;
};

export function confirmedSwapManual(
  data: ScheduleData,
  input: ManualSwapInput,
): ConfirmedSwap | { error: string } {
  const blocked = swapPairError(input.leaveDate, input.partnerDate);
  if (blocked) return { error: blocked };
  const leaveDay = weekdayFromIsoDate(input.leaveDate);
  const partnerDay = weekdayFromIsoDate(input.partnerDate);
  if (!leaveDay) return { error: "原課堂日期只能係星期一至五" };
  if (!partnerDay) return { error: "調往日期只能係星期一至五" };
  const leaveLessons = regularLessonsAt(data, input.leaveTeacherId, leaveDay, input.leavePeriodId);
  if (leaveLessons.length === 0) {
    return { error: "請假老師喺嗰節無正規課堂可調" };
  }
  const partnerLessons = input.partnerTeacherId
    ? regularLessonsAt(data, input.partnerTeacherId, partnerDay, input.partnerPeriodId)
    : [];
  const reason = partnerLessons.length
    ? `人手對調：${leaveLessons.map((l) => l.subject).join("、")} ⇄ ${partnerLessons.map((l) => l.subject).join("、")}`
    : `人手調往空堂／CLP：${leaveLessons.map((l) => l.subject).join("、")}`;
  return confirmedSwapFromSuggestion(
    data,
    input.leaveTeacherId,
    input.leaveDate,
    input.leavePeriodId,
    leaveLessons,
    input.partnerDate,
    partnerDay,
    input.partnerPeriodId,
    partnerLessons,
    reason,
    input.leaveKind,
  );
}

/** 人手修改已確認調堂；沿用原紀錄 id，衝突檢查會略過自己 */
export function reviseConfirmedSwap(
  data: ScheduleData,
  swaps: ConfirmedSwap[],
  swapId: string,
  input: ManualSwapInput,
): { swaps: ConfirmedSwap[]; saved: ConfirmedSwap } | { error: string } {
  const current = swaps.find((s) => s.id === swapId);
  if (!current) return { error: "找不到要修改嘅調堂紀錄" };
  const rebuilt = confirmedSwapManual(data, input);
  if ("error" in rebuilt) return rebuilt;
  const saved: ConfirmedSwap = {
    ...rebuilt,
    id: current.id,
    confirmedAt: new Date().toISOString(),
    reason: rebuilt.reason.replace(/^人手/, "人手修改"),
    leaveKind: input.leaveKind ?? current.leaveKind,
  };
  const conflict = swapConflicts(swaps, saved);
  if (conflict) return { error: conflict };
  return {
    saved,
    swaps: swaps.map((s) => (s.id === swapId ? saved : s)),
  };
}

function relocateLesson(
  lesson: Lesson,
  swapId: string,
  tag: string,
  day: DayId,
  periodId: string,
): Lesson {
  return {
    ...lesson,
    id: `swap:${swapId}:${tag}:${lesson.id}`,
    day,
    periodId,
  };
}

/**
 * 將已確認調堂疊上每週課表，得出某一曆日嘅有效課表。
 * 原節課堂搬走；對手節（可為空堂／CLP）改為上原課堂。
 */
export function applyConfirmedSwaps(
  data: ScheduleData,
  date: string,
  swaps: ConfirmedSwap[],
): ScheduleData {
  const day = weekdayFromIsoDate(date);
  if (!day) return data;

  const removeIds = new Set<string>();
  const added: Lesson[] = [];

  for (const s of swaps) {
    if (s.mode === "split_rotate") {
      if (s.leaveDate === date) {
        for (const id of s.leaveLessonIds) removeIds.add(id);
      }
      if (s.partnerDate === date) {
        for (const id of s.partnerLessonIds) removeIds.add(id);
      }
      continue;
    }

    const pairs = s.periodPairs?.length
      ? s.periodPairs
      : [{ leavePeriodId: s.leavePeriodId, partnerPeriodId: s.partnerPeriodId }];

    if (s.leaveDate === date) {
      for (const id of s.leaveLessonIds) removeIds.add(id);
      for (const id of s.partnerLessonIds) {
        const orig = data.lessons.find((l) => l.id === id);
        if (!orig || !isTeachingLesson(orig)) continue;
        const pair =
          pairs.find((p) => p.partnerPeriodId === orig.periodId) ?? pairs[0]!;
        added.push(relocateLesson(orig, s.id, "to-leave", day, pair.leavePeriodId));
      }
    }
    if (s.partnerDate === date) {
      for (const id of s.partnerLessonIds) removeIds.add(id);
      for (const id of s.leaveLessonIds) {
        const orig = data.lessons.find((l) => l.id === id);
        if (!orig || !isTeachingLesson(orig)) continue;
        const pair = pairs.find((p) => p.leavePeriodId === orig.periodId) ?? pairs[0]!;
        added.push(relocateLesson(orig, s.id, "to-partner", day, pair.partnerPeriodId));
      }
    }
  }

  if (removeIds.size === 0 && added.length === 0) return data;
  return {
    ...data,
    lessons: [...data.lessons.filter((l) => !removeIds.has(l.id)), ...added],
  };
}

export function swapsAffectingDate(swaps: ConfirmedSwap[], date: string): ConfirmedSwap[] {
  return swaps.filter((s) => s.leaveDate === date || s.partnerDate === date);
}
