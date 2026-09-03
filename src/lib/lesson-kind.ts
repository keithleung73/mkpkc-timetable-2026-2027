import type { Lesson } from "./types";

/** CLP 備課／會議：唔係正規課堂 */
export function isClpSubject(subject: string): boolean {
  return /CLP/i.test(subject);
}

export function isNonRegularLesson(lesson: Pick<Lesson, "kind" | "subject">): boolean {
  if ((lesson.kind ?? "lesson") === "meeting") return true;
  return isClpSubject(lesson.subject);
}

/** 正規授課先會佔用老師（CLP／會議唔擋調堂或代堂） */
export function lessonOccupiesTeacher(lesson: Pick<Lesson, "kind" | "subject">): boolean {
  return !isNonRegularLesson(lesson);
}

export function isTeachingLesson(lesson: Pick<Lesson, "kind" | "subject">): boolean {
  return lessonOccupiesTeacher(lesson);
}
