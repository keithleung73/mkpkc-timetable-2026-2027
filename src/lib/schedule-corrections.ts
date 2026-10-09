import { ensureHomeroomLessons, isHomeroomLesson } from "./homeroom";
import type { ScheduleData, Teacher } from "./types";

/** 已辭職：保留喺老師名單方便舊紀錄對名，但不編代堂。 */
export const RESIGNED_TEACHER_IDS = ["彤"] as const;

export const RESIGNED_COVER_REASON = "已辭職，不安排代堂";

/** 學務部人手更正：官方總表仍寫舊班主任。 */
export const CLASS_TEACHER_CORRECTIONS: Record<string, readonly string[]> = {
  "2A": ["會"],
};

/** 余沛峰代林紀彤（已辭職）嘅課堂。 */
export const LESSON_TEACHER_REPLACEMENTS: Record<string, string> = {
  彤: "余",
};

const YU_PEI_FUNG: Teacher = {
  id: "余",
  name: "余沛峰",
  code: "余",
  subjects: ["中文", "普話"],
};

export function isResignedTeacher(teacherId: string): boolean {
  return (RESIGNED_TEACHER_IDS as readonly string[]).includes(teacherId);
}

function markResigned(teacher: Teacher): Teacher {
  if (teacher.name.includes("已辭職")) return teacher;
  return { ...teacher, name: `${teacher.name}（已辭職）` };
}

function upsertYu(teachers: Teacher[]): Teacher[] {
  if (teachers.some((t) => t.id === YU_PEI_FUNG.id || t.code === YU_PEI_FUNG.code)) {
    return teachers;
  }
  const from = teachers.find((t) => t.id === "彤");
  const yu: Teacher = {
    ...YU_PEI_FUNG,
    subjects: from?.subjects?.length ? [...from.subjects] : [...YU_PEI_FUNG.subjects],
  };
  const idx = teachers.findIndex((t) => t.id === "彤");
  if (idx >= 0) {
    return [...teachers.slice(0, idx + 1), yu, ...teachers.slice(idx + 1)];
  }
  return [...teachers, yu];
}

function remapTeacherIds(ids: string[], classIds: string[], homeroom: boolean): string[] {
  if (homeroom) {
    for (const classId of classIds) {
      const next = CLASS_TEACHER_CORRECTIONS[classId];
      if (next) return [...next];
    }
  }
  return ids.map((id) => LESSON_TEACHER_REPLACEMENTS[id] ?? id);
}

/** 人手編制更正：2A 班主任朱會強；余沛峰承接林紀彤課堂。可重複套用。 */
export function applyScheduleCorrections(data: ScheduleData): ScheduleData {
  const teachers = upsertYu(data.teachers).map((t) =>
    isResignedTeacher(t.id) ? markResigned(t) : t,
  );
  const classes = data.classes.map((cls) => {
    const next = CLASS_TEACHER_CORRECTIONS[cls.id];
    if (!next) return cls;
    return { ...cls, classTeacherIds: [...next] };
  });
  const lessons = data.lessons.map((lesson) => {
    const teacherIds = remapTeacherIds(
      lesson.teacherIds,
      lesson.classIds,
      isHomeroomLesson(lesson),
    );
    if (teacherIds.length === lesson.teacherIds.length && teacherIds.every((id, i) => id === lesson.teacherIds[i])) {
      return lesson;
    }
    return { ...lesson, teacherIds };
  });
  return { ...data, teachers, classes, lessons };
}

/** 載入後統一處理：編制更正 → 補班主任節。 */
export function prepareSchedule(data: ScheduleData): ScheduleData {
  return ensureHomeroomLessons(applyScheduleCorrections(data));
}
