import { DAYS } from "./constants";
import type { DayId, Lesson, ScheduleData, SchoolClass } from "./types";

export const HOMEROOM_PERIOD_ID = "hr";
export const HOMEROOM_SUBJECT = "班主任節";
export const HOMEROOM_COVER_WEIGHT = 0.5;

export function isHomeroomPeriod(periodId: string): boolean {
  return periodId === HOMEROOM_PERIOD_ID;
}

export function isHomeroomLesson(lesson: Pick<Lesson, "periodId" | "subject">): boolean {
  return isHomeroomPeriod(lesson.periodId) || lesson.subject === HOMEROOM_SUBJECT;
}

/** 班主任節代堂／請假只當 0.5 節；其餘一堂當 1。 */
export function coverWeight(periodId: string): number {
  return isHomeroomPeriod(periodId) ? HOMEROOM_COVER_WEIGHT : 1;
}

export function formatCoverPoints(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return rounded > 0 ? `+${text}` : text;
}

function hasHomeroom(lessons: Lesson[], day: DayId, classId: string): boolean {
  return lessons.some(
    (l) => l.day === day && isHomeroomLesson(l) && l.classIds.includes(classId),
  );
}

function classTeachersOf(cls: SchoolClass): string[] {
  return [...new Set((cls.classTeacherIds ?? []).filter(Boolean))];
}

/** 用各班班主任名單補上每日班主任節（IAL 班無班主任則略過）。 */
export function ensureHomeroomLessons(data: ScheduleData): ScheduleData {
  const extras: Lesson[] = [];
  for (const cls of data.classes) {
    if (cls.id.endsWith("-IAL")) continue;
    const teacherIds = classTeachersOf(cls);
    if (teacherIds.length === 0) continue;
    for (const day of DAYS) {
      if (hasHomeroom(data.lessons, day.id, cls.id)) continue;
      extras.push({
        id: `${HOMEROOM_PERIOD_ID}|${day.id}|${cls.id}`,
        day: day.id,
        periodId: HOMEROOM_PERIOD_ID,
        classIds: [cls.id],
        teacherIds,
        subject: HOMEROOM_SUBJECT,
        roomId: cls.homeRoom || "",
        kind: "lesson",
        note: "班主任節 · 代堂只計 0.5 節",
      });
    }
  }
  if (extras.length === 0) return data;
  return { ...data, lessons: [...data.lessons, ...extras] };
}
