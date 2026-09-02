export type DayId = "mon" | "tue" | "wed" | "thu" | "fri";

export type PeriodKind = "lesson" | "break" | "lunch" | "assembly" | "other";

export interface PeriodDef {
  id: string;
  label: string;
  kind: PeriodKind;
}

export interface PeriodTime {
  start: string;
  end: string;
}

export interface Teacher {
  id: string;
  name: string;
  code: string;
  subjects: string[];
  englishName?: string;
  romanizations?: string[];
}

export interface SchoolClass {
  id: string;
  name: string;
  form: number;
  stream?: string;
  homeRoom: string;
  classTeacherIds: string[];
}

export interface Room {
  id: string;
  name: string;
  kind: "classroom" | "special";
}

export interface Lesson {
  id: string;
  day: DayId;
  periodId: string;
  classIds: string[];
  teacherIds: string[];
  subject: string;
  roomId: string;
  note?: string;
  kind?: "lesson" | "meeting";
}

export interface SchoolMeta {
  school: string;
  schoolEn: string;
  year: string;
  updatedAt: string;
  source: string;
}

export interface ScheduleData {
  meta: SchoolMeta;
  teachers: Teacher[];
  classes: SchoolClass[];
  rooms: Room[];
  lessons: Lesson[];
}
