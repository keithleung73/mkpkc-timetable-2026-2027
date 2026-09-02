import { DAYS, SCHOOL_YEAR, SUBJECT_ABBR } from "./constants";
import type { CoverAssignment, CoverPlan, CoverSlot } from "./cover";
import { classNames, roomName, teacherById } from "./queries";
import type { DayId, ScheduleData } from "./types";

export type CoverPdfRow = {
  date: string;
  showDate: boolean;
  teacher: string;
  showTeacher: boolean;
  action: string;
  periods: string;
  classSubjectRoom: string;
  coverTeacher: string;
  arrangement: string;
  remark: string;
};

export type AffectedSubjectCell = {
  subject: string;
  count: number;
  levels: string;
  periods: string;
};

const PDF_SUBJECT: Record<string, string> = {
  中國語文: "中文",
  英國語文: "英文",
  數學: "數學",
  公民經濟與社會: "公經社",
  公民與社會發展: "公民",
  資訊及通訊科技: "電腦",
  中國歷史: "中史",
};

function periodNumber(periodId: string): number {
  const n = Number(String(periodId).replace(/^p/i, ""));
  return Number.isFinite(n) ? n : 99;
}

export function formatCoverFormDate(iso: string, day: DayId): string {
  const parts = iso.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  const short = DAYS.find((x) => x.id === day)?.short ?? "";
  return `${d}/${m}/${y}(${short})`;
}

export function coverPdfFilename(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `代堂調堂處理_${Number(d)}.${Number(m)}.${y}.pdf`;
}

export function coverFormHeader(): string {
  return `萬鈞伯裘書院${SCHOOL_YEAR}調堂安排`;
}

export function involvedTeacherNames(plan: CoverPlan, data: ScheduleData): string {
  return plan.absentees
    .map((id) => teacherById(data, id)?.name ?? id)
    .join("、");
}

function subjectShort(subject: string): string {
  return PDF_SUBJECT[subject] ?? SUBJECT_ABBR[subject] ?? subject;
}

function classLabel(data: ScheduleData, classIds: string[]): string {
  if (classIds.length === 1) {
    return data.classes.find((c) => c.id === classIds[0])?.name ?? classIds[0];
  }
  const forms = new Set(
    classIds.map((id) => {
      const cls = data.classes.find((c) => c.id === id);
      return cls?.form ?? Number(id.match(/\d/)?.[0] ?? 0);
    }),
  );
  if (forms.size === 1) {
    const form = [...forms][0];
    if (form) return `S${form}`;
  }
  return classNames(data, classIds);
}

type RawLine = {
  periodId: string;
  periodNum: number;
  absenteeId: string;
  absenteeName: string;
  classIds: string[];
  subject: string;
  roomId: string;
  coverTeacherId: string;
  coverTeacherName: string;
  leftover: boolean;
};

function rawLines(plan: CoverPlan): RawLine[] {
  const assigned = new Map(
    plan.assignments.map((a) => [
      `${a.periodId}|${a.absenteeId}|${[...a.classIds].sort().join(",")}|${a.subject}|${a.roomId}`,
      a,
    ]),
  );
  const lines: RawLine[] = [];
  const seen = new Set<string>();

  const pushSlot = (slot: CoverSlot, cover: CoverAssignment | undefined) => {
    const key = `${slot.periodId}|${slot.teacherId}|${[...slot.classIds].sort().join(",")}|${slot.subject}|${slot.roomId}`;
    if (seen.has(key)) return;
    seen.add(key);
    lines.push({
      periodId: slot.periodId,
      periodNum: periodNumber(slot.periodId),
      absenteeId: slot.teacherId,
      absenteeName: slot.teacherName,
      classIds: slot.classIds,
      subject: slot.subject,
      roomId: slot.roomId,
      coverTeacherId: cover?.coverTeacherId ?? "",
      coverTeacherName: cover?.coverTeacherName ?? "",
      leftover: !cover,
    });
  };

  for (const slot of plan.slots) {
    const key = `${slot.periodId}|${slot.teacherId}|${[...slot.classIds].sort().join(",")}|${slot.subject}|${slot.roomId}`;
    pushSlot(slot, assigned.get(key));
  }
  return lines.sort(
    (a, b) =>
      a.absenteeName.localeCompare(b.absenteeName, "zh-Hant") ||
      a.periodNum - b.periodNum ||
      a.subject.localeCompare(b.subject, "zh-Hant"),
  );
}

function sameGroup(a: RawLine, b: RawLine) {
  return (
    a.absenteeId === b.absenteeId &&
    a.coverTeacherId === b.coverTeacherId &&
    a.leftover === b.leftover &&
    a.subject === b.subject &&
    a.roomId === b.roomId &&
    [...a.classIds].sort().join(",") === [...b.classIds].sort().join(",")
  );
}

export function coverPdfRows(plan: CoverPlan, data: ScheduleData): CoverPdfRow[] {
  const date = formatCoverFormDate(plan.date, plan.day);
  const lines = rawLines(plan);
  const groups: RawLine[][] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    const prev = last?.[last.length - 1];
    if (
      last &&
      prev &&
      sameGroup(prev, line) &&
      line.periodNum === prev.periodNum + 1
    ) {
      last.push(line);
    } else {
      groups.push([line]);
    }
  }

  let lastTeacher = "";
  return groups.map((group, index) => {
    const first = group[0];
    const showTeacher = first.absenteeName !== lastTeacher;
    lastTeacher = first.absenteeName;
    const periods = group.map((g) => String(g.periodNum)).join("，");
    const room = roomName(data, first.roomId);
    return {
      date,
      showDate: index === 0,
      teacher: first.absenteeName,
      showTeacher,
      action: "代堂",
      periods,
      classSubjectRoom: `${classLabel(data, first.classIds)} ${subjectShort(first.subject)} ${room}`,
      coverTeacher: first.leftover ? "" : first.coverTeacherName,
      arrangement: first.leftover ? "" : "即日代堂",
      remark: first.leftover ? "未能編配" : "",
    };
  });
}

export function affectedSubjects(plan: CoverPlan, data: ScheduleData): AffectedSubjectCell[] {
  const map = new Map<
    string,
    { subject: string; count: number; levels: Set<string>; periods: Set<number> }
  >();
  for (const slot of plan.slots) {
    const subject = subjectShort(slot.subject);
    const cur = map.get(subject) ?? {
      subject,
      count: 0,
      levels: new Set<string>(),
      periods: new Set<number>(),
    };
    cur.count += 1;
    cur.levels.add(classLabel(data, slot.classIds));
    cur.periods.add(periodNumber(slot.periodId));
    map.set(subject, cur);
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject, "zh-Hant"))
    .map((x) => ({
      subject: x.subject,
      count: x.count,
      levels: [...x.levels].join("、"),
      periods: [...x.periods]
        .sort((a, b) => a - b)
        .join("，"),
    }));
}

export function chunkAffected(items: AffectedSubjectCell[], size = 3): AffectedSubjectCell[][] {
  const out: AffectedSubjectCell[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  if (out.length === 0) out.push([]);
  return out;
}
