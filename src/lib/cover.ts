import { COVER_PERIOD_IDS, periodLabel as periodLabelFromConstants } from "./constants";
import type { DayId, Lesson, ScheduleData, Teacher } from "./types";

export const MAX_OWN_LESSONS = 6;

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
};

export type CoverPlan = {
  day: DayId;
  date: string;
  absentees: string[];
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
  assignments: { coverTeacherId: string }[];
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
    const ids = new Set(plan.assignments.map((a) => a.coverTeacherId));
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
  if (day === "fri") return COVER_PERIOD_IDS.filter((id) => id !== "p9");
  return [...COVER_PERIOD_IDS];
}

function isTeachingLesson(lesson: Lesson) {
  return (lesson.kind ?? "lesson") === "lesson";
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
    (l) => l.day === day && l.periodId === periodId && l.teacherIds.includes(teacherId),
  );
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
    if (a.coverTeacherId !== teacherId) return false;
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
};

export function eligibleCoverTeachers(
  data: ScheduleData,
  day: DayId,
  absentees: Set<string>,
  balances: CoverBalances,
  slot: CoverSlot,
  alreadyAssigned: CoverAssignment[],
  ctx?: CoverPickContext,
): EligibleCover[] {
  const takenThisPeriod = new Set(
    alreadyAssigned.filter((a) => a.periodId === slot.periodId).map((a) => a.coverTeacherId),
  );

  const out: EligibleCover[] = [];
  for (const teacher of data.teachers) {
    if (absentees.has(teacher.id)) continue;
    if (takenThisPeriod.has(teacher.id)) continue;
    const own = teachingLessonsOnDay(data, teacher.id, day).length;
    if (own > MAX_OWN_LESSONS) continue;
    if (isOccupied(data, teacher.id, day, slot.periodId)) continue;
    if (consecutiveCoverViolation(day, slot.periodId, alreadyAssigned, teacher.id)) continue;
    const avoidPreferred = isCoverAvoidTeacher(teacher);
    const consecutiveDayRisk = ctx
      ? wouldExceedConsecutiveCoverDays(teacher.id, ctx.date, ctx.coverDatesByTeacher)
      : false;
    out.push({
      teacher,
      balance: balances[teacher.id] ?? 0,
      ownLessons: own,
      avoidPreferred,
      consecutiveDayRisk,
    });
  }

  // 1) 避開指定同事  2) 避免連續代堂超兩日  3) 負數結餘（病假／請假較多）優先  4) 當日堂數
  out.sort((a, b) => {
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

function pickReason(pick: EligibleCover) {
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
  pick: { teacher: Teacher; balance: number; reason: string },
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

export function generateCoverPlan(
  data: ScheduleData,
  day: DayId,
  date: string,
  absenteeIds: string[],
  balances: CoverBalances,
  recentPlans: CoverHistoryPlan[] = [],
): CoverPlan {
  const uniqueAbs = [...new Set(absenteeIds.filter(Boolean))];
  const absentees = new Set(uniqueAbs);
  const slots = slotsToCover(data, day, uniqueAbs);
  const coverDatesByTeacher = buildCoverDatesByTeacher(recentPlans, date);
  const ctx: CoverPickContext = { date, coverDatesByTeacher };

  const remaining = [...slots].sort((a, b) => {
    const sa = scarcityScore(data, day, absentees, balances, a, ctx);
    const sb = scarcityScore(data, day, absentees, balances, b, ctx);
    if (sa !== sb) return sa - sb;
    return periodIndex(day, a.periodId) - periodIndex(day, b.periodId);
  });

  const assignments: CoverAssignment[] = [];
  const leftover: CoverSlot[] = [];
  const working: CoverBalances = { ...balances };

  for (const slot of remaining) {
    const pick = pickCoverTeacher(data, day, absentees, working, slot, assignments, ctx);
    if (!pick) {
      leftover.push(slot);
      continue;
    }
    assignments.push(toAssignment(slot, pick));
    working[pick.teacher.id] = (working[pick.teacher.id] ?? 0) + 1;
    let set = coverDatesByTeacher.get(pick.teacher.id);
    if (!set) {
      set = new Set();
      coverDatesByTeacher.set(pick.teacher.id, set);
    }
    set.add(date);
  }

  return {
    day,
    date,
    absentees: uniqueAbs,
    slots,
    assignments: sortByPeriod(day, assignments),
    leftover: sortByPeriod(day, leftover),
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
  const absentees = new Set(plan.absentees);
  const ctx: CoverPickContext = {
    date: plan.date,
    coverDatesByTeacher: buildCoverDatesByTeacher(recentPlans, plan.date),
  };
  const list = eligibleCoverTeachers(data, plan.day, absentees, balances, slot, others, ctx);
  const pick = list.find((x) => x.teacher.id === newTeacherId);
  if (!pick) return plan;

  const nextAssignment = toAssignment(slot, { ...pick, reason: pickReason(pick) });
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
  if (expected.length !== plan.slots.length || plan.slots.some((s) => !expectedKeys.has(slotKey(s)))) {
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
    if (absentees.has(a.coverTeacherId)) return "請假同事不能代堂";
    const slot: CoverSlot = {
      periodId: a.periodId,
      classIds: a.classIds,
      subject: a.subject,
      roomId: a.roomId,
      teacherId: a.absenteeId,
      teacherName: a.absenteeName,
    };
    const ok = eligibleCoverTeachers(data, plan.day, absentees, balances, slot, soFar).some(
      (x) => x.teacher.id === a.coverTeacherId,
    );
    if (!ok) return `${a.coverTeacherName} 唔符合代堂規則（${periodLabelFromConstants(a.periodId)}）`;
    soFar.push(a);
  }
  return null;
}

export function applyBalances(balances: CoverBalances, plan: CoverPlan): CoverBalances {
  const next = { ...balances };
  const covered = new Set(plan.assignments.map(assignmentKey));
  for (const a of plan.assignments) {
    next[a.absenteeId] = (next[a.absenteeId] ?? 0) - 1;
    next[a.coverTeacherId] = (next[a.coverTeacherId] ?? 0) + 1;
  }
  for (const slot of plan.slots) {
    if (!covered.has(slotKey(slot))) {
      next[slot.teacherId] = (next[slot.teacherId] ?? 0) - 1;
    }
  }
  return next;
}

export function undoBalances(balances: CoverBalances, plan: CoverPlan): CoverBalances {
  const next = { ...balances };
  const covered = new Set(plan.assignments.map(assignmentKey));
  for (const a of plan.assignments) {
    next[a.absenteeId] = (next[a.absenteeId] ?? 0) + 1;
    next[a.coverTeacherId] = (next[a.coverTeacherId] ?? 0) - 1;
  }
  for (const slot of plan.slots) {
    if (!covered.has(slotKey(slot))) {
      next[slot.teacherId] = (next[slot.teacherId] ?? 0) + 1;
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
