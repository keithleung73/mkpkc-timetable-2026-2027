import type { Lesson } from "./types";

/** CLP 備課／會議：唔係正規課堂 */
export function isClpSubject(subject: string): boolean {
  return /CLP/i.test(subject);
}

/**
 * CLP、聯咨會、首席會、各部會等行政時段：唔係課堂。
 * 不用代堂、唔擋代堂，亦不計入老師當日正規堂數。
 */
export function isAdminDutySubject(subject: string): boolean {
  const s = subject.replace(/\s+/g, "");
  if (!s) return false;
  if (isClpSubject(s)) return true;
  if (/會議/.test(s)) return true;
  if (/聯咨會|首席會|生涯會|資創會/.test(s)) return true;
  if (/(學務|學生|學校|資訊及創新|質保|SEN).{0,4}部會/.test(s)) return true;
  if (/部會/.test(s)) return true;
  if (/^學務|^學生部|^學校部|^資訊及創新|^質保部|^SEN/.test(s)) return true;
  return false;
}

/** 重摘課：佔用老師，但不能用來調堂 */
export function isRemedialSubject(subject: string): boolean {
  return subject.includes("重摘課");
}

export function isRemedialLesson(lesson: Pick<Lesson, "subject">): boolean {
  return isRemedialSubject(lesson.subject);
}

export function isNonRegularLesson(lesson: Pick<Lesson, "kind" | "subject">): boolean {
  if ((lesson.kind ?? "lesson") === "meeting") return true;
  return isAdminDutySubject(lesson.subject);
}

/** 正規授課先會佔用老師（CLP／會議／部會唔擋調堂或代堂） */
export function lessonOccupiesTeacher(lesson: Pick<Lesson, "kind" | "subject">): boolean {
  return !isNonRegularLesson(lesson);
}

export function isTeachingLesson(lesson: Pick<Lesson, "kind" | "subject">): boolean {
  return lessonOccupiesTeacher(lesson);
}
