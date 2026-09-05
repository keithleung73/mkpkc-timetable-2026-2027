import { COVER_PERIOD_IDS } from "./constants";
import { isClpSubject, isTeachingLesson, lessonOccupiesTeacher } from "./lesson-kind";
import type { DayId, Lesson, ScheduleData } from "./types";

/** 同一科一次調堂最多 3 堂（可兩堂一拼，但不能 4 堂或以上） */
export const MAX_SAME_SUBJECT_IN_ONE_SWAP = 3;

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

/** 同一科在今次調堂入面有 4 堂或以上就不准 */
export function exceedsSameSubjectSwapLimit(lessons: Pick<Lesson, "subject">[]): boolean {
  const counts = new Map<string, number>();
  for (const l of lessons) {
    const k = subjectKey(l.subject);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.values()].some((n) => n > MAX_SAME_SUBJECT_IN_ONE_SWAP);
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
