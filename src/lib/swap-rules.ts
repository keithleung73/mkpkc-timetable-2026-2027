import { COVER_PERIOD_IDS } from "./constants";
import { isClpSubject, isTeachingLesson, lessonOccupiesTeacher } from "./lesson-kind";
import { classTokenMatches } from "./queries";
import type { DayId, Lesson, ScheduleData } from "./types";

/** 調堂後同一班同一日同一科最多 3 堂（例如 4A 不能一日上四堂中文） */
export const MAX_SAME_SUBJECT_PER_CLASS_PER_DAY = 3;

export type SwapMode = "period" | "clp" | "split_rotate" | "subject_pair";

export type SwapPeriodPair = {
  leavePeriodId: string;
  partnerPeriodId: string;
};

export function subjectKey(subject: string): string {
  const s = subject.replace(/\s+/g, "");
  if (s === "普話" || s.includes("普通話")) return "普通話";
  if (s.includes("戲劇")) return "戲劇";
  return s;
}

export function isPutonghuaSubject(subject: string): boolean {
  return subjectKey(subject) === "普通話";
}

export function isDramaSubject(subject: string): boolean {
  return subjectKey(subject) === "戲劇";
}

export function isPthDramaPair(lessons: Pick<Lesson, "subject">[]): boolean {
  const keys = new Set(lessons.map((l) => subjectKey(l.subject)));
  return keys.has("普通話") && keys.has("戲劇");
}

export function splitRotatePartnerSubject(subject: string): "普通話" | "戲劇" | null {
  if (isPutonghuaSubject(subject)) return "戲劇";
  if (isDramaSubject(subject)) return "普通話";
  return null;
}

export function roomFreeIgnoring(
  data: ScheduleData,
  roomId: string,
  day: DayId,
  periodId: string,
  ignoreLessonIds: Set<string>,
): boolean {
  if (!roomId) return true;
  return !data.lessons.some(
    (l) =>
      l.day === day &&
      l.periodId === periodId &&
      l.roomId === roomId &&
      !ignoreLessonIds.has(l.id) &&
      isTeachingLesson(l),
  );
}

export function roomsFreeForMove(
  data: ScheduleData,
  moving: Lesson[],
  day: DayId,
  periodId: string,
  ignoreLessonIds: Set<string>,
): boolean {
  return moving.every((l) => roomFreeIgnoring(data, l.roomId, day, periodId, ignoreLessonIds));
}

/** 班別當日科目：中文／中國語文視為同一科 */
export function classSubjectKey(subject: string): string {
  const s = subject.replace(/\s+/g, "");
  if (s === "普話" || s.includes("普通話")) return "普通話";
  if (s.includes("戲劇")) return "戲劇";
  if (s === "中文" || s.includes("中國語文")) return "中文";
  return subjectKey(subject);
}

function lessonTouchesClass(lesson: Pick<Lesson, "classIds">, classId: string): boolean {
  return lesson.classIds.some(
    (c) => c === classId || classTokenMatches(c, classId) || classTokenMatches(classId, c),
  );
}

export function classSubjectPeriodIdsOnDay(
  data: ScheduleData,
  classId: string,
  day: DayId,
  subject: string,
  ignoreLessonIds: Set<string> = new Set(),
): Set<string> {
  const key = classSubjectKey(subject);
  const periods = new Set<string>();
  for (const l of data.lessons) {
    if (l.day !== day || !isTeachingLesson(l) || ignoreLessonIds.has(l.id)) continue;
    if (!lessonTouchesClass(l, classId)) continue;
    if (classSubjectKey(l.subject) !== key) continue;
    periods.add(l.periodId);
  }
  return periods;
}

type RelocatedLesson = { lesson: Lesson; periodId: string };

function relocateByPairs(
  lessons: Lesson[],
  pairs: SwapPeriodPair[],
  from: "leave" | "partner",
): RelocatedLesson[] {
  const teaching = lessons.filter((l) => isTeachingLesson(l) && !isClpSubject(l.subject));
  if (pairs.length === 0) {
    return teaching.map((lesson) => ({ lesson, periodId: lesson.periodId }));
  }
  const out: RelocatedLesson[] = [];
  for (const lesson of teaching) {
    const pair =
      pairs.length === 1
        ? pairs[0]
        : pairs.find((p) => (from === "leave" ? p.leavePeriodId : p.partnerPeriodId) === lesson.periodId);
    if (!pair) continue;
    out.push({
      lesson,
      periodId: from === "leave" ? pair.partnerPeriodId : pair.leavePeriodId,
    });
  }
  return out;
}

/** 把 incoming 課堂加落該日之後，若有班同一科變成 4 堂或以上就回錯誤 */
export function incomingExceedsClassSubjectDayCap(
  data: ScheduleData,
  day: DayId,
  incoming: RelocatedLesson[],
  ignoreLessonIds: Set<string>,
): string | null {
  const classIds = [...new Set(incoming.flatMap((x) => x.lesson.classIds))];
  for (const classId of classIds) {
    const addBySubject = new Map<string, Set<string>>();
    for (const { lesson, periodId } of incoming) {
      if (!lessonTouchesClass(lesson, classId)) continue;
      const key = classSubjectKey(lesson.subject);
      const set = addBySubject.get(key) ?? new Set<string>();
      set.add(periodId);
      addBySubject.set(key, set);
    }
    for (const [key, addPeriods] of addBySubject) {
      const existing = classSubjectPeriodIdsOnDay(data, classId, day, key, ignoreLessonIds);
      const union = new Set([...existing, ...addPeriods]);
      if (union.size > MAX_SAME_SUBJECT_PER_CLASS_PER_DAY) {
        return `調堂後 ${classId} 當日不能上 4 堂或以上${key}`;
      }
    }
  }
  return null;
}

export function swapExceedsClassSubjectDayCap(
  data: ScheduleData,
  leaveDay: DayId,
  partnerDay: DayId,
  leaveLessons: Lesson[],
  partnerLessons: Lesson[],
  periodPairs: SwapPeriodPair[] = [],
): string | null {
  const partnerTeaching = partnerLessons.filter((l) => isTeachingLesson(l) && !isClpSubject(l.subject));
  const pairs = periodPairs.length
    ? periodPairs
    : leaveLessons[0] && partnerDay
      ? [
          {
            leavePeriodId: leaveLessons[0].periodId,
            partnerPeriodId: partnerLessons[0]?.periodId ?? leaveLessons[0].periodId,
          },
        ]
      : [];
  const destErr = incomingExceedsClassSubjectDayCap(
    data,
    partnerDay,
    relocateByPairs(leaveLessons, pairs, "leave"),
    new Set(partnerTeaching.map((l) => l.id)),
  );
  if (destErr) return destErr;
  return incomingExceedsClassSubjectDayCap(
    data,
    leaveDay,
    relocateByPairs(partnerTeaching, pairs, "partner"),
    new Set(leaveLessons.map((l) => l.id)),
  );
}

export function swapModeLabel(mode?: SwapMode): string | null {
  if (mode === "clp") return "CLP";
  if (mode === "split_rotate") return "對拆輪換";
  if (mode === "subject_pair") return "同一科兩堂";
  return null;
}

export function adjacentPeriodPairs(day: DayId): [string, string][] {
  const ids =
    day === "fri" ? COVER_PERIOD_IDS.filter((id) => id !== "p9") : [...COVER_PERIOD_IDS];
  const out: [string, string][] = [];
  for (let i = 0; i < ids.length - 1; i++) {
    out.push([ids[i]!, ids[i + 1]!]);
  }
  return out;
}

export function teacherHasOnlyClpOrFree(
  data: ScheduleData,
  teacherId: string,
  day: DayId,
  periodId: string,
  ignoreLessonIds: Set<string>,
): boolean {
  const mine = data.lessons.filter(
    (l) =>
      l.day === day &&
      l.periodId === periodId &&
      l.teacherIds.includes(teacherId) &&
      !ignoreLessonIds.has(l.id),
  );
  return mine.every((l) => isClpSubject(l.subject) || !lessonOccupiesTeacher(l));
}
