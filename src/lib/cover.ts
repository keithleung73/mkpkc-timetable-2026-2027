import { COVER_PERIOD_IDS, periodLabel as periodLabelFromConstants } from "./constants";
import { coverWeight, formatCoverPoints, HOMEROOM_PERIOD_ID, isHomeroomLesson } from "./homeroom";
import { leaveCountsBalance, type LeaveKind } from "./leave";
import { isTeachingLesson, lessonOccupiesTeacher } from "./lesson-kind";
import { classesOverlap, findPthDramaPartnerLesson, isPthDramaSubject } from "./swap-rules";
import type { DayId, Lesson, ScheduleData, Teacher } from "./types";

export { coverWeight, formatCoverPoints };

/** 普通話／戲劇合班：有安排但不計 ±、每日代堂上限、連續代堂日 */
export const PTH_DRAMA_COMBINE_REASON = "普通話／戲劇合班，不計節數";

export const MAX_OWN_LESSONS = 6;

/** 同一代堂人一日內代堂總量不能超過呢個數（班主任節計 0.5） */
export const MAX_COVER_LOAD_PER_DAY = 2;

/** 盡量避免編代堂（軟限制：無人可代時仍可編；亦可人手改派） */
export const COVER_AVOID_TEACHER_NAMES = [
  "張敬才",
  "呂詩恩",
  "梁國龍",
  "伍卓鍵",
  "張永泰",
  "郭鳳萍",
] as const;

/** 同一星期內，盡量唔好連續代堂多於呢個日數 */
export const MAX_CONSECUTIVE_COVER_DAYS = 2;

export type CoverSlot = {
  periodId: string;
  classIds: string[];
  subject: string;
  roomId: string;
  teacherId: string;
  teacherName: string;
};

/** 代堂同事選「不適用」：該節不用找人代，亦不計 ±。 */
export const COVER_NOT_APPLICABLE_ID = "__na__";
export const COVER_NOT_APPLICABLE_LABEL = "不適用";
export const COVER_NOT_APPLICABLE_REASON = "不適用，該節不用代堂";

export type CoverAssignment = {
  periodId: string;
  classIds: string[];
  subject: string;
  roomId: string;
  absenteeId: string;
  absenteeName: string;
  coverTeacherId: string;
  coverTeacherName: string;
  coverBalanceBefore: number;
  reason: string;
  /** 普通話／戲劇由在場另一位老師合班：列入安排但不計節數 */
  combine?: boolean;
  /** 人手標成不用代堂：不佔人、不計 ± */
  waived?: boolean;
};

export function isCoverWaived(a: { waived?: boolean; coverTeacherId?: string }): boolean {
  return Boolean(a.waived) || a.coverTeacherId === COVER_NOT_APPLICABLE_ID;
}

export function toWaivedAssignment(slot: CoverSlot): CoverAssignment {
  return {
    periodId: slot.periodId,
    classIds: slot.classIds,
    subject: slot.subject,
    roomId: slot.roomId,
    absenteeId: slot.teacherId,
    absenteeName: slot.teacherName,
    coverTeacherId: COVER_NOT_APPLICABLE_ID,
    coverTeacherName: COVER_NOT_APPLICABLE_LABEL,
    coverBalanceBefore: 0,
    reason: COVER_NOT_APPLICABLE_REASON,
    waived: true,
  };
}

export type CoverPlan = {
  day: DayId;
  date: string;
  absentees: string[];
  /** 每位請假同事嘅病假／事假／公假。公假不計 ±。 */
  leaveKinds?: Record<string, LeaveKind>;
  slots: CoverSlot[];
  assignments: CoverAssignment[];
  leftover: CoverSlot[];
};

export type CoverBalances = Record<string, number>;

export type SavedCoverPlan = CoverPlan & {
  id: string;
  confirmedAt: string;
};

const JS_DAY_TO_ID: Record<number, DayId> = {
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
};

export function weekdayFromIsoDate(iso: string): DayId | null {
  const d = new Date(`${iso}T12:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return null;
  return JS_DAY_TO_ID[d.getDay()] ?? null;
}

export function hkTodayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
}

function hkIsoFromDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
}

export function mondayOfWeekIso(iso: string): string {
  const d = new Date(`${iso}T12:00:00+08:00`);
  const dow = d.getDay(); // 0 Sun … 6 Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return hkIsoFromDate(d);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00+08:00`);
  d.setDate(d.getDate() + days);
  return hkIsoFromDate(d);
}

/** 該星期一至五（ISO 日期） */
export function schoolWeekDates(iso: string): string[] {
  const mon = mondayOfWeekIso(iso);
  return [0, 1, 2, 3, 4].map((i) => addDaysIso(mon, i));
}

export type CoverHistoryPlan = {
  date: string;
  assignments: { coverTeacherId: string; combine?: boolean }[];
};

/** 由已入帳方案建立「邊個喺邊日代過堂」索引（可排除當日以便重編） */
export function buildCoverDatesByTeacher(
  plans: CoverHistoryPlan[],
  excludeDate?: string,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const plan of plans) {
    if (excludeDate && plan.date === excludeDate) continue;
    if (!weekdayFromIsoDate(plan.date)) continue;
    const ids = new Set(
      plan.assignments
        .filter((a) => !a.combine && !isCoverWaived(a) && a.coverTeacherId)
        .map((a) => a.coverTeacherId),
    );
    for (const id of ids) {
      let set = map.get(id);
      if (!set) {
        set = new Set();
        map.set(id, set);
      }
      set.add(plan.date);
    }
  }
  return map;
}

/** 若今日再代，同一星期會唔會連續超過 MAX_CONSECUTIVE_COVER_DAYS 日 */
export function wouldExceedConsecutiveCoverDays(
  teacherId: string,
  date: string,
  coverDatesByTeacher: Map<string, Set<string>>,
): boolean {
  const week = schoolWeekDates(date);
  const weekSet = new Set(week);
  const dates = new Set(
    [...(coverDatesByTeacher.get(teacherId) ?? [])].filter((d) => weekSet.has(d) && d !== date),
  );
  dates.add(date);
  let streak = 0;
  let max = 0;
  for (const d of week) {
    if (dates.has(d)) {
      streak += 1;
      if (streak > max) max = streak;
    } else {
      streak = 0;
    }
  }
  return max > MAX_CONSECUTIVE_COVER_DAYS;
}

export function isCoverAvoidTeacher(teacher: Teacher) {
  return (COVER_AVOID_TEACHER_NAMES as readonly string[]).includes(teacher.name);
}

export type CoverPickContext = {
  date: string;
  coverDatesByTeacher: Map<string, Set<string>>;
};

export function coverPeriodIdsForDay(day: DayId): string[] {
  const core = day === "fri" ? COVER_PERIOD_IDS.filter((id) => id !== "p9") : [...COVER_PERIOD_IDS];
  return [HOMEROOM_PERIOD_ID, ...core];
}


export function teachingLessonsOnDay(data: ScheduleData, teacherId: string, day: DayId) {
  return data.lessons.filter(
    (l) =>
      l.day === day &&
      l.teacherIds.includes(teacherId) &&
      isTeachingLesson(l) &&
      coverPeriodIdsForDay(day).includes(l.periodId),
  );
}

export function teachingLoadOnDay(data: ScheduleData, teacherId: string, day: DayId) {
  return teachingLessonsOnDay(data, teacherId, day).reduce((sum, l) => sum + coverWeight(l.periodId), 0);
}

/** 當日正規課堂節數（班主任節唔計入「超過 6 堂不能代人」上限） */
export function ownTeachingLoadOnDay(data: ScheduleData, teacherId: string, day: DayId) {
  return teachingLessonsOnDay(data, teacherId, day).filter((l) => !isHomeroomLesson(l)).length;
}

export function absenteesOnDate(
  date: string,
  plans: { date: string; absentees?: string[] }[] = [],
  swaps: { leaveDate: string; leaveTeacherId: string }[] = [],
): Set<string> {
  const ids = new Set<string>();
  for (const plan of plans) {
    if (plan.date !== date) continue;
    for (const id of plan.absentees ?? []) ids.add(id);
  }
  for (const swap of swaps) {
    if (swap.leaveDate === date) ids.add(swap.leaveTeacherId);
  }
  return ids;
}

export function coverPlanOnDate<T extends { date: string }>(plans: T[], date: string): T | null {
  return plans.find((p) => p.date === date) ?? null;
}

/** 已確認代堂佔用該節，避免同一人同一節再被編去另一班。 */
export function applyConfirmedCovers(
  data: ScheduleData,
  date: string,
  plans: CoverPlan[],
): ScheduleData {
  const plan = coverPlanOnDate(plans, date);
  if (!plan || plan.assignments.length === 0) return data;
  const added: Lesson[] = [];
  for (const a of plan.assignments) {
    if (isCoverWaived(a) || !a.coverTeacherId) continue;
    if (isOccupied(data, a.coverTeacherId, plan.day, a.periodId)) continue;
    added.push({
      id: `cover:${plan.date}:${a.periodId}:${a.coverTeacherId}:${a.absenteeId}:${[...a.classIds].sort().join(",")}`,
      day: plan.day,
      periodId: a.periodId,
      classIds: [],
      teacherIds: [a.coverTeacherId],
      subject: "代堂",
      roomId: a.roomId,
      kind: "lesson",
      note: `代 ${a.absenteeName}`,
    });
  }
  if (added.length === 0) return data;
  return { ...data, lessons: [...data.lessons, ...added] };
}

export function slotKey(s: {
  periodId: string;
  teacherId: string;
  classIds: string[];
  subject: string;
  roomId: string;
}) {
  return `${s.periodId}|${s.teacherId}|${[...s.classIds].sort().join(",")}|${s.subject}|${s.roomId}`;
}

export function assignmentKey(a: CoverAssignment) {
  return slotKey({
    periodId: a.periodId,
    teacherId: a.absenteeId,
    classIds: a.classIds,
    subject: a.subject,
    roomId: a.roomId,
  });
}

export function slotsToCover(data: ScheduleData, day: DayId, absenteeIds: string[]): CoverSlot[] {
  const abs = new Set(absenteeIds);
  const coverPeriods = new Set(coverPeriodIdsForDay(day));
  const grouped = new Map<string, CoverSlot>();
  for (const lesson of data.lessons) {
    if (lesson.day !== day) continue;
    if (!isTeachingLesson(lesson)) continue;
    if (!coverPeriods.has(lesson.periodId)) continue;
    if (isHomeroomLesson(lesson)) {
      const stillHere = lesson.teacherIds.filter((id) => !abs.has(id));
      if (stillHere.length > 0) continue;
      const leadId = lesson.teacherIds.find((id) => abs.has(id));
      if (!leadId) continue;
      const teacher = data.teachers.find((t) => t.id === leadId);
      const slot: CoverSlot = {
        periodId: lesson.periodId,
        classIds: [...lesson.classIds],
        subject: lesson.subject,
        roomId: lesson.roomId,
        teacherId: leadId,
        teacherName: teacher?.name ?? leadId,
      };
      const key = slotKey(slot);
      if (!grouped.has(key)) grouped.set(key, slot);
      continue;
    }
    for (const teacherId of lesson.teacherIds) {
      if (!abs.has(teacherId)) continue;
      const teacher = data.teachers.find((t) => t.id === teacherId);
      const slot: CoverSlot = {
        periodId: lesson.periodId,
        classIds: [...lesson.classIds],
        subject: lesson.subject,
        roomId: lesson.roomId,
        teacherId,
        teacherName: teacher?.name ?? teacherId,
      };
      const key = slotKey(slot);
      if (!grouped.has(key)) grouped.set(key, slot);
    }
  }
  const order = new Map(coverPeriodIdsForDay(day).map((id, i) => [id, i]));
  return [...grouped.values()].sort(
    (a, b) =>
      (order.get(a.periodId) ?? 99) - (order.get(b.periodId) ?? 99) ||
      a.teacherName.localeCompare(b.teacherName, "zh-Hant"),
  );
}

function periodIndex(day: DayId, periodId: string) {
  return coverPeriodIdsForDay(day).indexOf(periodId);
}

export function isOccupied(data: ScheduleData, teacherId: string, day: DayId, periodId: string) {
  return data.lessons.some(
    (l) =>
      l.day === day &&
      l.periodId === periodId &&
      l.teacherIds.includes(teacherId) &&
      lessonOccupiesTeacher(l),
  );
}

/** 該節普通話／戲劇堂，在場另一位老師可合班（雙方都請假則無人可合班） */
export function pthDramaCombinePartnerIds(
  data: ScheduleData,
  day: DayId,
  slot: Pick<CoverSlot, "periodId" | "classIds" | "subject" | "teacherId">,
  absentees: Set<string>,
): string[] {
  if (!isPthDramaSubject(slot.subject)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (!id || id === slot.teacherId || absentees.has(id) || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };

  const partnerLesson = findPthDramaPartnerLesson(data, {
    id: `combine-probe:${slot.teacherId}:${slot.periodId}`,
    day,
    periodId: slot.periodId,
    classIds: slot.classIds,
    subject: slot.subject,
  });
  if (partnerLesson) {
    for (const id of partnerLesson.teacherIds) add(id);
  }

  for (const lesson of data.lessons) {
    if (lesson.day !== day || lesson.periodId !== slot.periodId) continue;
    if (!isTeachingLesson(lesson)) continue;
    if (!classesOverlap(lesson.classIds, slot.classIds)) continue;
    if (!isPthDramaSubject(lesson.subject)) continue;
    if (!lesson.teacherIds.includes(slot.teacherId)) continue;
    for (const id of lesson.teacherIds) add(id);
  }
  return ids;
}

export function isPthDramaCombinePartner(
  data: ScheduleData,
  day: DayId,
  slot: Pick<CoverSlot, "periodId" | "classIds" | "subject" | "teacherId">,
  absentees: Set<string>,
  teacherId: string,
): boolean {
  return pthDramaCombinePartnerIds(data, day, slot, absentees).includes(teacherId);
}

export function assignedCoverLoad(assignments: CoverAssignment[], teacherId: string): number {
  return assignments
    .filter((a) => a.coverTeacherId === teacherId && !a.combine && !isCoverWaived(a))
    .reduce((sum, a) => sum + coverWeight(a.periodId), 0);
}

function wouldExceedDailyCoverLoad(
  alreadyAssigned: CoverAssignment[],
  teacherId: string,
  periodId: string,
) {
  return assignedCoverLoad(alreadyAssigned, teacherId) + coverWeight(periodId) > MAX_COVER_LOAD_PER_DAY;
}

function consecutiveCoverViolation(
  day: DayId,
  coverPeriod: string,
  alreadyAssigned: CoverAssignment[],
  teacherId: string,
) {
  const order = coverPeriodIdsForDay(day);
  const idx = order.indexOf(coverPeriod);
  if (idx < 0) return true;
  const prev = order[idx - 1];
  const next = order[idx + 1];
  return alreadyAssigned.some((a) => {
    if (a.coverTeacherId !== teacherId || a.combine) return false;
    return a.periodId === prev || a.periodId === next;
  });
}

export type EligibleCover = {
  teacher: Teacher;
  balance: number;
  ownLessons: number;
  /** 行政上盡量唔安排代堂 */
  avoidPreferred: boolean;
  /** 今日再代會令同一星期連續代堂超過上限 */
  consecutiveDayRisk: boolean;
  /** 人手指定：唔符合自動編配（例如原有堂數較多／連堂）但仍可代 */
  manualOnly?: boolean;
  /** 普通話／戲劇合班搭檔：該節有課仍可合班，不計節數 */
  combine?: boolean;
};

function takenCoverIdsThisPeriod(alreadyAssigned: CoverAssignment[], periodId: string) {
  return new Set(
    alreadyAssigned
      .filter((a) => a.periodId === periodId && !isCoverWaived(a) && a.coverTeacherId)
      .map((a) => a.coverTeacherId),
  );
}

/** 硬限制：請假、該節已有課／已代、一日代堂超過兩堂。人手指定都要守。合班搭檔可例外。 */
export function coverHardBlockReason(
  data: ScheduleData,
  day: DayId,
  absentees: Set<string>,
  slot: CoverSlot,
  alreadyAssigned: CoverAssignment[],
  teacherId: string,
): string | null {
  const combine = isPthDramaCombinePartner(data, day, slot, absentees, teacherId);
  if (absentees.has(teacherId)) return "請假同事不能代堂";
  if (teacherId === slot.teacherId) return "請假同事不能代自己";
  if (takenCoverIdsThisPeriod(alreadyAssigned, slot.periodId).has(teacherId)) {
    return "該節已代另一堂";
  }
  if (!combine && isOccupied(data, teacherId, day, slot.periodId)) return "該節有課，不能代堂";
  if (!combine && wouldExceedDailyCoverLoad(alreadyAssigned, teacherId, slot.periodId)) {
    return "同一日代堂不能多過兩堂";
  }
  return null;
}

function toEligibleCover(
  data: ScheduleData,
  day: DayId,
  balances: CoverBalances,
  teacher: Teacher,
  ctx: CoverPickContext | undefined,
  manualOnly: boolean,
  combine = false,
): EligibleCover {
  return {
    teacher,
    balance: balances[teacher.id] ?? 0,
    ownLessons: ownTeachingLoadOnDay(data, teacher.id, day),
    avoidPreferred: isCoverAvoidTeacher(teacher),
    consecutiveDayRisk: ctx
      ? wouldExceedConsecutiveCoverDays(teacher.id, ctx.date, ctx.coverDatesByTeacher)
      : false,
    manualOnly,
    combine,
  };
}

export function eligibleCoverTeachers(
  data: ScheduleData,
  day: DayId,
  absentees: Set<string>,
  balances: CoverBalances,
  slot: CoverSlot,
  alreadyAssigned: CoverAssignment[],
  ctx?: CoverPickContext,
): EligibleCover[] {
  const out: EligibleCover[] = [];
  for (const teacher of data.teachers) {
    const combine = isPthDramaCombinePartner(data, day, slot, absentees, teacher.id);
    if (coverHardBlockReason(data, day, absentees, slot, alreadyAssigned, teacher.id)) continue;
    const own = ownTeachingLoadOnDay(data, teacher.id, day);
    if (!combine && own > MAX_OWN_LESSONS) continue;
    if (!combine && consecutiveCoverViolation(day, slot.periodId, alreadyAssigned, teacher.id)) {
      continue;
    }
    out.push(toEligibleCover(data, day, balances, teacher, ctx, false, combine));
  }

  // 1) 普通話／戲劇合班搭檔  2) 避開指定同事  3) 避免連續代堂超兩日  4) 負數結餘優先  5) 當日堂數
  out.sort((a, b) => {
    if (Boolean(a.combine) !== Boolean(b.combine)) {
      return Number(Boolean(b.combine)) - Number(Boolean(a.combine));
    }
    if (a.avoidPreferred !== b.avoidPreferred) {
      return Number(a.avoidPreferred) - Number(b.avoidPreferred);
    }
    if (a.consecutiveDayRisk !== b.consecutiveDayRisk) {
      return Number(a.consecutiveDayRisk) - Number(b.consecutiveDayRisk);
    }
    if (a.balance !== b.balance) return a.balance - b.balance;
    if (a.ownLessons !== b.ownLessons) return a.ownLessons - b.ownLessons;
    return a.teacher.name.localeCompare(b.teacher.name, "zh-Hant");
  });
  return out;
}

/** 人手指定名單：該節得閒、未代過該節、未超過一日兩堂。可越過自動編配嘅 6 堂／連堂限制。 */
export function manualCoverTeachers(
  data: ScheduleData,
  day: DayId,
  absentees: Set<string>,
  balances: CoverBalances,
  slot: CoverSlot,
  alreadyAssigned: CoverAssignment[],
  ctx?: CoverPickContext,
): EligibleCover[] {
  const autoIds = new Set(
    eligibleCoverTeachers(data, day, absentees, balances, slot, alreadyAssigned, ctx).map(
      (x) => x.teacher.id,
    ),
  );
  const out: EligibleCover[] = [];
  for (const teacher of data.teachers) {
    if (autoIds.has(teacher.id)) continue;
    if (coverHardBlockReason(data, day, absentees, slot, alreadyAssigned, teacher.id)) continue;
    out.push(toEligibleCover(data, day, balances, teacher, ctx, true));
  }
  out.sort((a, b) => {
    if (a.ownLessons !== b.ownLessons) return a.ownLessons - b.ownLessons;
    return a.teacher.name.localeCompare(b.teacher.name, "zh-Hant");
  });
  return out;
}

function pickReason(pick: EligibleCover) {
  if (pick.combine) return PTH_DRAMA_COMBINE_REASON;
  const sign = pick.balance < 0 ? "負數結餘優先" : pick.balance === 0 ? "結餘為零" : "結餘較低";
  const notes: string[] = [];
  if (pick.consecutiveDayRisk) notes.push("本週已連續代堂");
  if (pick.avoidPreferred) notes.push("盡量少編名單");
  const suffix = notes.length ? `；${notes.join("、")}` : "";
  return `${sign}（${pick.balance}），當日原有 ${pick.ownLessons} 堂${suffix}`;
}

function pickCoverTeacher(
  data: ScheduleData,
  day: DayId,
  absentees: Set<string>,
  balances: CoverBalances,
  slot: CoverSlot,
  alreadyAssigned: CoverAssignment[],
  ctx?: CoverPickContext,
) {
  const list = eligibleCoverTeachers(data, day, absentees, balances, slot, alreadyAssigned, ctx);
  const pick = list[0];
  if (!pick) return null;
  return { ...pick, reason: pickReason(pick) };
}

function scarcityScore(
  data: ScheduleData,
  day: DayId,
  absentees: Set<string>,
  balances: CoverBalances,
  slot: CoverSlot,
  ctx?: CoverPickContext,
) {
  return eligibleCoverTeachers(data, day, absentees, balances, slot, [], ctx).length;
}

function toAssignment(
  slot: CoverSlot,
  pick: { teacher: Teacher; balance: number; reason: string; combine?: boolean },
): CoverAssignment {
  return {
    periodId: slot.periodId,
    classIds: slot.classIds,
    subject: slot.subject,
    roomId: slot.roomId,
    absenteeId: slot.teacherId,
    absenteeName: slot.teacherName,
    coverTeacherId: pick.teacher.id,
    coverTeacherName: pick.teacher.name,
    coverBalanceBefore: pick.balance,
    reason: pick.reason,
    ...(pick.combine ? { combine: true } : {}),
  };
}

function sortByPeriod<T extends { periodId: string; absenteeName?: string; teacherName?: string }>(
  day: DayId,
  items: T[],
) {
  const order = new Map(coverPeriodIdsForDay(day).map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const pd = (order.get(a.periodId) ?? 99) - (order.get(b.periodId) ?? 99);
    if (pd !== 0) return pd;
    const an = a.absenteeName ?? a.teacherName ?? "";
    const bn = b.absenteeName ?? b.teacherName ?? "";
    return an.localeCompare(bn, "zh-Hant");
  });
}

function leaveKindsForAbsentees(
  absenteeIds: string[],
  leaveKinds?: Record<string, LeaveKind>,
): Record<string, LeaveKind> | undefined {
  if (!leaveKinds) return undefined;
  const next: Record<string, LeaveKind> = {};
  for (const id of absenteeIds) {
    if (leaveKinds[id]) next[id] = leaveKinds[id]!;
  }
  return Object.keys(next).length ? next : undefined;
}

export function generateCoverPlan(
  data: ScheduleData,
  day: DayId,
  date: string,
  absenteeIds: string[],
  balances: CoverBalances,
  recentPlans: CoverHistoryPlan[] = [],
  leaveKinds?: Record<string, LeaveKind>,
  seed?: CoverPlan | null,
): CoverPlan {
  const seedSameDay = seed && seed.date === date ? seed : null;
  const uniqueAbs = [...new Set([...absenteeIds, ...(seedSameDay?.absentees ?? [])].filter(Boolean))];
  const absentees = new Set(uniqueAbs);
  const slots = slotsToCover(data, day, uniqueAbs);
  const expectedKeys = new Set(slots.map(slotKey));
  const coverDatesByTeacher = buildCoverDatesByTeacher(recentPlans, date);
  const ctx: CoverPickContext = { date, coverDatesByTeacher };

  const assignments: CoverAssignment[] = [];
  if (seedSameDay) {
    for (const a of seedSameDay.assignments) {
      if (!expectedKeys.has(assignmentKey(a))) continue;
      const seedSlot: CoverSlot = {
        periodId: a.periodId,
        classIds: a.classIds,
        subject: a.subject,
        roomId: a.roomId,
        teacherId: a.absenteeId,
        teacherName: a.absenteeName,
      };
      if (isCoverWaived(a)) {
        assignments.push(toWaivedAssignment(seedSlot));
        continue;
      }
      if (coverHardBlockReason(data, day, absentees, seedSlot, assignments, a.coverTeacherId)) {
        continue;
      }
      const combine =
        a.combine || isPthDramaCombinePartner(data, day, seedSlot, absentees, a.coverTeacherId);
      assignments.push(
        combine
          ? { ...a, combine: true, reason: a.reason || PTH_DRAMA_COMBINE_REASON }
          : a,
      );
    }
  }

  const leftover: CoverSlot[] = [];
  const working: CoverBalances = { ...balances };
  const creditCoverDay = (teacherId: string) => {
    let set = coverDatesByTeacher.get(teacherId);
    if (!set) {
      set = new Set();
      coverDatesByTeacher.set(teacherId, set);
    }
    set.add(date);
  };
  for (const a of assignments) {
    if (a.combine || isCoverWaived(a)) continue;
    working[a.coverTeacherId] = (working[a.coverTeacherId] ?? 0) + coverWeight(a.periodId);
    creditCoverDay(a.coverTeacherId);
  }

  const remaining = slots.filter((s) => !assignments.some((a) => assignmentKey(a) === slotKey(s)));
  const still: CoverSlot[] = [];
  for (const slot of remaining) {
    const partnerId = pthDramaCombinePartnerIds(data, day, slot, absentees)[0];
    const partner = partnerId ? data.teachers.find((t) => t.id === partnerId) : undefined;
    if (
      partner &&
      !coverHardBlockReason(data, day, absentees, slot, assignments, partner.id)
    ) {
      assignments.push(
        toAssignment(slot, {
          teacher: partner,
          balance: working[partner.id] ?? 0,
          reason: PTH_DRAMA_COMBINE_REASON,
          combine: true,
        }),
      );
      continue;
    }
    still.push(slot);
  }

  still.sort((a, b) => {
    const sa = scarcityScore(data, day, absentees, balances, a, ctx);
    const sb = scarcityScore(data, day, absentees, balances, b, ctx);
    if (sa !== sb) return sa - sb;
    return periodIndex(day, a.periodId) - periodIndex(day, b.periodId);
  });

  for (const slot of still) {
    const pick = pickCoverTeacher(data, day, absentees, working, slot, assignments, ctx);
    if (!pick) {
      leftover.push(slot);
      continue;
    }
    assignments.push(toAssignment(slot, pick));
    if (pick.combine) continue;
    working[pick.teacher.id] = (working[pick.teacher.id] ?? 0) + coverWeight(slot.periodId);
    creditCoverDay(pick.teacher.id);
  }

  return {
    day,
    date,
    absentees: uniqueAbs,
    leaveKinds: leaveKindsForAbsentees(uniqueAbs, {
      ...(seedSameDay?.leaveKinds ?? {}),
      ...(leaveKinds ?? {}),
    }),
    slots,
    assignments: sortByPeriod(day, assignments),
    leftover: sortByPeriod(day, leftover),
  };
}

/** 調堂頁即時揀代堂建議：只併入該一節，唔會把當日其餘課堂當 leftover 扣分。 */
export function mergeCoverSlotIntoPlan(
  data: ScheduleData,
  existing: CoverPlan | null,
  date: string,
  day: DayId,
  absenteeId: string,
  periodId: string,
  coverTeacherId: string,
  leaveKind: LeaveKind,
): CoverPlan | { error: string } {
  const absentee = data.teachers.find((t) => t.id === absenteeId);
  const coverTeacher = data.teachers.find((t) => t.id === coverTeacherId);
  if (!absentee) return { error: "搵唔到請假老師" };
  if (!coverTeacher) return { error: "搵唔到代堂老師" };
  if (absenteeId === coverTeacherId) return { error: "請假同事不能代自己" };

  const absentees = [...new Set([...(existing?.absentees ?? []), absenteeId])];
  const targetSlots = slotsToCover(data, day, [absenteeId]).filter((s) => s.periodId === periodId);
  if (targetSlots.length === 0) {
    return { error: "該節無需代堂（可能已調走或當日無課）" };
  }
  const keep = (existing?.assignments ?? []).filter(
    (a) => !(a.absenteeId === absenteeId && a.periodId === periodId),
  );
  const probe: CoverSlot = {
    periodId,
    classIds: targetSlots[0]?.classIds ?? [],
    subject: targetSlots[0]?.subject ?? "",
    roomId: targetSlots[0]?.roomId ?? "",
    teacherId: absenteeId,
    teacherName: absentee.name,
  };
  const absentSet = new Set(absentees);
  const blocked = coverHardBlockReason(
    data,
    day,
    absentSet,
    probe,
    keep,
    coverTeacherId,
  );
  if (blocked) return { error: `${coverTeacher.name} ${blocked}` };
  const combine = targetSlots.some((slot) =>
    isPthDramaCombinePartner(data, day, slot, absentSet, coverTeacherId),
  );

  const newAssignments = targetSlots.map((slot) =>
    toAssignment(slot, {
      teacher: coverTeacher,
      balance: 0,
      reason: combine ? PTH_DRAMA_COMBINE_REASON : "調堂頁即時揀建議",
      combine,
    }),
  );
  const assignments = sortByPeriod(day, [...keep, ...newAssignments]);
  const slotMap = new Map((existing?.slots ?? []).map((s) => [slotKey(s), s]));
  for (const slot of targetSlots) slotMap.set(slotKey(slot), slot);
  const slots = sortByPeriod(day, [...slotMap.values()]);
  const leftover = sortByPeriod(
    day,
    slots.filter((s) => !assignments.some((a) => assignmentKey(a) === slotKey(s))),
  );
  return {
    day,
    date,
    absentees,
    leaveKinds: { ...(existing?.leaveKinds ?? {}), [absenteeId]: leaveKind },
    slots,
    assignments,
    leftover,
  };
}

export function reassignCover(
  data: ScheduleData,
  plan: CoverPlan,
  targetKey: string,
  newTeacherId: string,
  balances: CoverBalances,
  recentPlans: CoverHistoryPlan[] = [],
): CoverPlan {
  const slot =
    plan.slots.find((s) => slotKey(s) === targetKey) ??
    plan.leftover.find((s) => slotKey(s) === targetKey);
  if (!slot) return plan;

  const others = plan.assignments.filter((a) => assignmentKey(a) !== targetKey);
  if (newTeacherId === COVER_NOT_APPLICABLE_ID) {
    const assignments = sortByPeriod(plan.day, [...others, toWaivedAssignment(slot)]);
    const leftover = sortByPeriod(
      plan.day,
      plan.slots.filter((s) => !assignments.some((a) => assignmentKey(a) === slotKey(s))),
    );
    return { ...plan, assignments, leftover };
  }
  const absentees = new Set(plan.absentees);
  const ctx: CoverPickContext = {
    date: plan.date,
    coverDatesByTeacher: buildCoverDatesByTeacher(recentPlans, plan.date),
  };
  const list = eligibleCoverTeachers(data, plan.day, absentees, balances, slot, others, ctx);
  const pick =
    list.find((x) => x.teacher.id === newTeacherId) ??
    manualCoverTeachers(data, plan.day, absentees, balances, slot, others, ctx).find(
      (x) => x.teacher.id === newTeacherId,
    );
  if (!pick) return plan;

  const nextAssignment = toAssignment(slot, {
    ...pick,
    reason: pick.combine
      ? PTH_DRAMA_COMBINE_REASON
      : pick.manualOnly
        ? `人手指定，當日原有 ${pick.ownLessons} 堂`
        : pickReason(pick),
  });
  const assignments = sortByPeriod(plan.day, [...others, nextAssignment]);
  const leftover = sortByPeriod(
    plan.day,
    plan.slots.filter((s) => !assignments.some((a) => assignmentKey(a) === slotKey(s))),
  );
  return { ...plan, assignments, leftover };
}

export function validateCoverPlan(
  data: ScheduleData,
  plan: CoverPlan,
  balances: CoverBalances,
): string | null {
  const day = weekdayFromIsoDate(plan.date);
  if (!day) return "日期唔係上課日";
  if (day !== plan.day) return "日期同星期唔對";

  const expected = slotsToCover(data, plan.day, plan.absentees);
  const expectedKeys = new Set(expected.map(slotKey));
  if (plan.slots.some((s) => !expectedKeys.has(slotKey(s)))) {
    return "需代堂次同請假名單唔符";
  }

  const absentees = new Set(plan.absentees);
  const seen = new Set<string>();
  const soFar: CoverAssignment[] = [];
  for (const a of sortByPeriod(plan.day, plan.assignments)) {
    const key = assignmentKey(a);
    if (seen.has(key)) return "同一堂重複編配";
    seen.add(key);
    if (!expectedKeys.has(key)) return "編配咗唔存在嘅堂次";
    const slot: CoverSlot = {
      periodId: a.periodId,
      classIds: a.classIds,
      subject: a.subject,
      roomId: a.roomId,
      teacherId: a.absenteeId,
      teacherName: a.absenteeName,
    };
    if (isCoverWaived(a)) {
      soFar.push({ ...a, waived: true });
      continue;
    }
    const blocked = coverHardBlockReason(data, plan.day, absentees, slot, soFar, a.coverTeacherId);
    if (blocked) {
      return `${a.coverTeacherName} 唔符合代堂規則（${periodLabelFromConstants(a.periodId)}：${blocked}）`;
    }
    soFar.push(a);
  }
  return null;
}

function absenteeCountsBalance(plan: CoverPlan, teacherId: string): boolean {
  return leaveCountsBalance(plan.leaveKinds?.[teacherId]);
}

export function applyBalances(balances: CoverBalances, plan: CoverPlan): CoverBalances {
  const next = { ...balances };
  const covered = new Set(plan.assignments.map(assignmentKey));
  for (const a of plan.assignments) {
    if (a.combine || isCoverWaived(a) || !absenteeCountsBalance(plan, a.absenteeId)) continue;
    const w = coverWeight(a.periodId);
    next[a.absenteeId] = (next[a.absenteeId] ?? 0) - w;
    next[a.coverTeacherId] = (next[a.coverTeacherId] ?? 0) + w;
  }
  for (const slot of plan.slots) {
    if (!covered.has(slotKey(slot)) && absenteeCountsBalance(plan, slot.teacherId)) {
      next[slot.teacherId] = (next[slot.teacherId] ?? 0) - coverWeight(slot.periodId);
    }
  }
  return next;
}

export function undoBalances(balances: CoverBalances, plan: CoverPlan): CoverBalances {
  const next = { ...balances };
  const covered = new Set(plan.assignments.map(assignmentKey));
  for (const a of plan.assignments) {
    if (a.combine || isCoverWaived(a) || !absenteeCountsBalance(plan, a.absenteeId)) continue;
    const w = coverWeight(a.periodId);
    next[a.absenteeId] = (next[a.absenteeId] ?? 0) + w;
    next[a.coverTeacherId] = (next[a.coverTeacherId] ?? 0) - w;
  }
  for (const slot of plan.slots) {
    if (!covered.has(slotKey(slot)) && absenteeCountsBalance(plan, slot.teacherId)) {
      next[slot.teacherId] = (next[slot.teacherId] ?? 0) + coverWeight(slot.periodId);
    }
  }
  return next;
}

export function previewDeltas(plan: CoverPlan): Record<string, number> {
  const empty: CoverBalances = {};
  return applyBalances(empty, plan);
}

export function periodLabel(periodId: string) {
  return periodLabelFromConstants(periodId);
}
