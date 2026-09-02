import type { DayId, Lesson, ScheduleData, Teacher } from "./types";
import { ALL_TEACHING_PERIODS, DAYS, LESSON_PERIODS } from "./constants";

import { filterTeachers } from "./search";

export function teacherById(data: ScheduleData, id: string): Teacher | undefined {
  return data.teachers.find((t) => t.id === id || t.code === id);
}

export function searchTeachers(data: ScheduleData, q: string): Teacher[] {
  return filterTeachers(data.teachers, q);
}

export function lessonsOfTeacher(data: ScheduleData, teacherId: string): Lesson[] {
  return data.lessons.filter((l) => l.teacherIds.includes(teacherId));
}

export function classTokenMatches(token: string, classId: string): boolean {
  const t = token.toUpperCase().replace(/\s/g, "");
  const c = classId.toUpperCase();
  if (t === c) return true;
  if (t === "4IAL" && c === "4E-IAL") return true;
  if (t === "5IAL" && c === "5E-IAL") return true;
  if (t === "6IAL" && c === "6E-IAL") return true;
  if (/^4EG\d$/.test(t) && (c === "4E" || c === "4E-IAL")) return true;
  if (c.endsWith("-IAL")) return t === c || t === `${c[0]}IAL`;
  const form = c[0];
  const letter = c.slice(1);
  if (t === `S${form}` && /^[4-6]$/.test(form)) return true;
  if (t === `${form}ABE` && ["A", "B", "E"].includes(letter)) return true;
  if (t === `${form}BE` && ["B", "E"].includes(letter)) return true;
  if (t === `${form}AB` && ["A", "B"].includes(letter)) return true;
  if (t === `${form}DE` && ["D", "E"].includes(letter)) return true;
  if (t.includes(c) && /^[1-6][A-E]/.test(c) && t.length <= 8) return true;
  return false;
}

export function lessonsOfClass(data: ScheduleData, classId: string): Lesson[] {
  return data.lessons.filter(
    (l) =>
      (l.kind ?? "lesson") !== "meeting" &&
      l.classIds.some((id) => classTokenMatches(id, classId)),
  );
}

export function lessonAt(
  data: ScheduleData,
  day: DayId,
  periodId: string,
  who: { teacherId?: string; classId?: string },
): Lesson | undefined {
  return data.lessons.find((l) => {
    if (l.day !== day || l.periodId !== periodId) return false;
    if (who.teacherId && !l.teacherIds.includes(who.teacherId)) return false;
    if (who.classId && !l.classIds.includes(who.classId)) return false;
    return true;
  });
}

export function teacherLessonCountOnDay(data: ScheduleData, teacherId: string, day: DayId): number {
  return data.lessons.filter((l) => l.day === day && l.teacherIds.includes(teacherId)).length;
}

export function weeklyLoad(data: ScheduleData, teacherId: string): number {
  return lessonsOfTeacher(data, teacherId).length;
}

export function isFree(data: ScheduleData, teacherId: string, day: DayId, periodId: string): boolean {
  if (periodId === "p9" && day === "fri") return true;
  return !data.lessons.some(
    (l) => l.day === day && l.periodId === periodId && l.teacherIds.includes(teacherId),
  );
}

export function freeTeachers(
  data: ScheduleData,
  day: DayId,
  periodId: string,
  opts?: { subject?: string },
): Teacher[] {
  let list = data.teachers.filter((t) => isFree(data, t.id, day, periodId));
  if (opts?.subject) {
    const s = opts.subject;
    list = [...list].sort((a, b) => {
      const as = a.subjects.includes(s) ? 0 : 1;
      const bs = b.subjects.includes(s) ? 0 : 1;
      return as - bs;
    });
  }
  return list;
}

export type SubstituteCandidate = {
  teacher: Teacher;
  lessonsToday: number;
  weekly: number;
  teachesClass: boolean;
  sameSubject: boolean;
  underSeven: boolean;
};

export function substituteCandidates(
  data: ScheduleData,
  day: DayId,
  periodId: string,
  opts?: { classId?: string; subject?: string },
): SubstituteCandidate[] {
  const free = freeTeachers(data, day, periodId);
  const classTeacherIds = opts?.classId
    ? new Set(
        data.lessons
          .filter((l) => l.classIds.includes(opts.classId!))
          .flatMap((l) => l.teacherIds),
      )
    : new Set<string>();

  return free
    .map((teacher) => {
      const lessonsToday = teacherLessonCountOnDay(data, teacher.id, day);
      const sameSubject = opts?.subject ? teacher.subjects.includes(opts.subject) : false;
      const teachesClass = classTeacherIds.has(teacher.id);
      return {
        teacher,
        lessonsToday,
        weekly: weeklyLoad(data, teacher.id),
        teachesClass,
        sameSubject,
        underSeven: lessonsToday < 7,
      };
    })
    .sort((a, b) => {
      if (a.underSeven !== b.underSeven) return a.underSeven ? -1 : 1;
      if (a.teachesClass !== b.teachesClass) return a.teachesClass ? -1 : 1;
      if (a.sameSubject !== b.sameSubject) return a.sameSubject ? -1 : 1;
      if (a.lessonsToday !== b.lessonsToday) return a.lessonsToday - b.lessonsToday;
      return a.weekly - b.weekly;
    });
}

export function commonFreeSlots(data: ScheduleData, teacherIds: string[]) {
  if (teacherIds.length === 0) return [];
  const out: { day: DayId; periodId: string }[] = [];
  for (const day of DAYS) {
    const periods = day.id === "fri" ? LESSON_PERIODS : ALL_TEACHING_PERIODS;
    for (const p of periods) {
      if (teacherIds.every((id) => isFree(data, id, day.id, p.id))) {
        out.push({ day: day.id, periodId: p.id });
      }
    }
  }
  return out;
}

export function roomName(data: ScheduleData, roomId: string): string {
  return data.rooms.find((r) => r.id === roomId)?.name ?? roomId;
}

export function teacherNames(data: ScheduleData, ids: string[]): string {
  return ids
    .map((id) => {
      const t = teacherById(data, id);
      return t ? `${t.name}（${t.code}）` : id;
    })
    .join("、");
}

export function classNames(data: ScheduleData, ids: string[]): string {
  return ids.map((id) => data.classes.find((c) => c.id === id)?.name ?? id).join("、");
}

export function stats(data: ScheduleData) {
  return {
    teachers: data.teachers.length,
    classes: data.classes.length,
    rooms: data.rooms.length,
    lessons: data.lessons.length,
    specialRooms: data.rooms.filter((r) => r.kind === "special").length,
  };
}
