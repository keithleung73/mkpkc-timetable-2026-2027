import * as XLSX from "xlsx";
import {
  appendHeavyOwnLoadNote,
  applyBalances,
  ownTeachingLoadOnDay,
  type CoverAssignment,
  type CoverBalances,
  type CoverDutyNote,
  type CoverPlan,
  type CoverSlot,
  type SavedCoverPlan,
  undoBalances,
  weekdayFromIsoDate,
} from "./cover";
import { HOMEROOM_PERIOD_ID, HOMEROOM_SUBJECT } from "./homeroom";
import { type LeaveKind } from "./leave";
import { classTokenMatches } from "./queries";
import { teacherMatchScore, type SearchableTeacher } from "./search";
import { makeConfirmedSwap, type ConfirmedSwap } from "./swap-records";
import type { SwapPeriodPair } from "./swap-rules";
import { isTeachingLesson } from "./lesson-kind";
import type { DayId, Lesson, ScheduleData, Teacher } from "./types";

export type OfficialAction = "cover" | "swap" | "combine";

export type OfficialLessonRow = {
  sheet: string;
  date: string;
  day: DayId;
  originalTeacher: string;
  leaveLabel: string;
  leaveKind: LeaveKind;
  action: OfficialAction;
  leavePeriods: string[];
  leaveClassSubject: string;
  leaveRoom: string;
  coverTeacher: string;
  coverPeriods: string[];
  coverClassSubject: string;
  coverRoom: string;
  remark: string;
};

export type OfficialDutyRow = {
  sheet: string;
  date: string;
  kind: "duty" | "eca";
  teacherName: string;
  detail: string;
  location: string;
};

export type OfficialArrangementWorkbook = {
  source: string;
  rows: OfficialLessonRow[];
  duties: OfficialDutyRow[];
  emptyDates: string[];
  warnings: string[];
};

export type OfficialArrangementImport = {
  plans: SavedCoverPlan[];
  swaps: ConfirmedSwap[];
  warnings: string[];
  summary: {
    dates: string[];
    coverCount: number;
    combineCount: number;
    swapCount: number;
    leftoverCount: number;
    unmatchedTeachers: string[];
  };
};

const TEACHER_ALIASES: Record<string, string> = {
  raman: "KAUR",
  kaur: "KAUR",
  dari: "DARI",
  wayne: "WAY",
  way: "WAY",
  johan: "JOH",
  johnan: "JOH",
  joh: "JOH",
  scott: "SCOT",
  scot: "SCOT",
  wang: "WANG",
  "wang heumil": "WANG",
  "wang, heumil": "WANG",
  mirza: "MIRZ",
  mirz: "MIRZ",
  roisin: "ROIS",
  rois: "ROIS",
  郭嘉銘: "銘",
  郭家銘: "銘",
  范嘉揚: "NIC",
  范嘉楊: "NIC",
  溫敏兒: "KAUR",
};

const ZH_FOLDS: [RegExp, string][] = [
  [/強/g, "强"],
  [/穎/g, "頴"],
  [/柏/g, "栢"],
  [/為/g, "为"],
];

function foldText(raw: string): string {
  let s = String(raw ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\r\n]+/g, " ")
    .trim();
  for (const [re, to] of ZH_FOLDS) s = s.replace(re, to);
  return s;
}

function compact(raw: string): string {
  return foldText(raw).replace(/[\s,，、./]/g, "").toLowerCase();
}

function cell(row: unknown[], index: number): string {
  const v = row[index];
  if (v == null) return "";
  return foldText(String(v));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoDateFromParts(year: number, month: number, day: number): string | null {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${pad2(month)}-${pad2(day)}`;
  const d = new Date(`${iso}T12:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getFullYear() !== year || d.getMonth() + 1 !== month || d.getDate() !== day) return null;
  return iso;
}

export function parseOfficialDate(text: string, defaultYear = 2026): string | null {
  const s = foldText(text).replace(/\s/g, "");
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/.年-](\d{1,2})[/.月-](\d{2,4})/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return isoDateFromParts(year, month, day);
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return isoDateFromParts(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/.月-](\d{1,2})$/);
  if (m) return isoDateFromParts(defaultYear, Number(m[2]), Number(m[1]));
  return null;
}

export function parseOfficialPeriods(text: string): string[] {
  const s = foldText(text);
  if (!s) return [];
  if (/班主任/.test(s)) return [HOMEROOM_PERIOD_ID];
  const cleaned = s.replace(/整理節/g, " ").replace(/lesson/gi, " ").replace(/第/g, " ").replace(/節/g, " ");
  const nums = [...cleaned.matchAll(/\b(10|[1-9])\b/g)].map((m) => Number(m[1]));
  const unique = [...new Set(nums)].filter((n) => n >= 1 && n <= 10);
  return unique.map((n) => `p${n}`);
}

export function parseOfficialLeaveKind(text: string): LeaveKind {
  const s = foldText(text);
  if (/事假/.test(s)) return "personal";
  if (/病假/.test(s)) return "sick";
  return "official";
}

export function parseOfficialAction(text: string): OfficialAction | null {
  const s = foldText(text);
  if (/合班/.test(s)) return "combine";
  if (/調堂/.test(s)) return "swap";
  if (/代堂|代課/.test(s)) return "cover";
  return null;
}

export function datesInRemark(remark: string, sheetDate: string): string[] {
  const year = Number(sheetDate.slice(0, 4)) || 2026;
  const out: string[] = [];
  const s = foldText(remark);
  const re = /(\d{1,2})\s*[/.月-]\s*(\d{1,2})(?:\s*[/.年-]\s*(\d{2,4}))?/g;
  for (const m of s.matchAll(re)) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const y = m[3] ? (Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])) : year;
    const iso = isoDateFromParts(y, month, day);
    if (iso && iso !== sheetDate) out.push(iso);
  }
  return [...new Set(out)];
}

export function partnerDateFromRemark(remark: string, sheetDate: string): string {
  const arrow = foldText(remark).split(/->|→|⇒/)[1];
  if (arrow) {
    const fromArrow = datesInRemark(arrow, sheetDate)[0];
    if (fromArrow) return fromArrow;
  }
  const others = datesInRemark(remark, sheetDate);
  return others[0] ?? sheetDate;
}

export function partnerPeriodsFromRemark(remark: string): string[] {
  const arrow = foldText(remark).split(/->|→|⇒/)[1];
  if (!arrow) return [];
  const lesson = arrow.match(/lesson\s*([0-9及和、,，\s]+)/i);
  return lesson ? parseOfficialPeriods(lesson[1]) : [];
}

function isDateSheetName(name: string): boolean {
  return /^\d{1,2}-\d{1,2}$/.test(foldText(name));
}

function dateFromSheetName(name: string, year = 2026): string | null {
  const m = foldText(name).match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  return isoDateFromParts(year, Number(m[1]), Number(m[2]));
}

function looksLikeHeaderRow(row: unknown[]): boolean {
  const line = row.map((c) => foldText(String(c ?? ""))).join(" ");
  return /原課堂老師|Original Teacher/.test(line);
}

function looksLikeDutyHeader(row: unknown[]): boolean {
  const line = row.map((c) => foldText(String(c ?? ""))).join(" ");
  return /老師當值|Teacher on Duty|課外活動/.test(line);
}

export function parseOfficialArrangementWorkbook(
  input: ArrayBuffer | Uint8Array | Buffer,
  opts?: { source?: string; year?: number },
): OfficialArrangementWorkbook {
  const wb = XLSX.read(input, { type: "array", cellDates: true, raw: false });
  const year = opts?.year ?? 2026;
  const source = opts?.source ?? "通知各部門調堂代堂安排";
  const rows: OfficialLessonRow[] = [];
  const duties: OfficialDutyRow[] = [];
  const emptyDates: string[] = [];
  const warnings: string[] = [];

  for (const sheet of wb.SheetNames) {
    if (/sample|範本|樣本/i.test(sheet)) continue;
    const ws = wb.Sheets[sheet];
    if (!ws) continue;
    const table = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][];
    const dateCell = cell(table[0] ?? [], 1) || cell(table[0] ?? [], 0);
    const date =
      parseOfficialDate(dateCell, year) ??
      (isDateSheetName(sheet) ? dateFromSheetName(sheet, year) : null);
    if (!date) {
      warnings.push(`工作表「${sheet}」無法辨識日期`);
      continue;
    }
    const day = weekdayFromIsoDate(date);
    if (!day) {
      warnings.push(`${date}（${sheet}）唔係上課日`);
      continue;
    }

    let section: "lessons" | "duty" | null = null;
    let lessonCount = 0;
    for (const raw of table.slice(1)) {
      if (!raw || raw.every((c) => !foldText(String(c ?? "")))) continue;
      if (looksLikeHeaderRow(raw)) {
        section = "lessons";
        continue;
      }
      if (looksLikeDutyHeader(raw)) {
        section = "duty";
        continue;
      }
      if (section === "lessons") {
        const originalTeacher = cell(raw, 1);
        const action = parseOfficialAction(cell(raw, 3));
        if (!originalTeacher || !action) continue;
        const leavePeriods = parseOfficialPeriods(cell(raw, 4));
        const coverPeriods = parseOfficialPeriods(cell(raw, 8)) || leavePeriods;
        if (leavePeriods.length === 0) {
          warnings.push(`${date} ${originalTeacher}：無法辨識節數「${cell(raw, 4)}」`);
          continue;
        }
        rows.push({
          sheet,
          date,
          day,
          originalTeacher,
          leaveLabel: cell(raw, 2),
          leaveKind: parseOfficialLeaveKind(cell(raw, 2)),
          action,
          leavePeriods,
          leaveClassSubject: cell(raw, 5),
          leaveRoom: cell(raw, 6),
          coverTeacher: cell(raw, 7),
          coverPeriods: coverPeriods.length ? coverPeriods : leavePeriods,
          coverClassSubject: cell(raw, 9),
          coverRoom: cell(raw, 10),
          remark: cell(raw, 11),
        });
        lessonCount += 1;
        continue;
      }
      if (section === "duty") {
        const dutyTeacher = cell(raw, 1);
        const dutySlot = cell(raw, 2);
        const dutyLoc = cell(raw, 3);
        if (dutyTeacher && !/需安排|Teacher to be|負責/.test(dutyTeacher) && !/^\d+$/.test(dutyTeacher)) {
          duties.push({
            sheet,
            date,
            kind: "duty",
            teacherName: dutyTeacher,
            detail: dutySlot,
            location: dutyLoc,
          });
        }
        const ecaTeacher = cell(raw, 7);
        const ecaDetail = cell(raw, 8);
        if (ecaTeacher && !/需安排|Teacher to be|負責/.test(ecaTeacher) && !/^\d+$/.test(ecaTeacher)) {
          duties.push({
            sheet,
            date,
            kind: "eca",
            teacherName: ecaTeacher,
            detail: ecaDetail || dutySlot,
            location: cell(raw, 9),
          });
        }
      }
    }
    if (lessonCount === 0) emptyDates.push(date);
  }

  return { source, rows, duties, emptyDates, warnings };
}

function chineseLead(name: string): string {
  const m = foldText(name).match(/^[\u4e00-\u9fff]{2,4}/);
  return m?.[0] ?? "";
}

export function resolveOfficialTeacher(
  data: ScheduleData,
  rawName: string,
): Teacher | null {
  const raw = foldText(rawName);
  if (!raw) return null;
  const alias = TEACHER_ALIASES[raw.toLowerCase()] ?? TEACHER_ALIASES[compact(raw)] ?? TEACHER_ALIASES[chineseLead(raw)];
  const queries = [raw, alias, chineseLead(raw), compact(raw)].filter(Boolean) as string[];

  for (const q of queries) {
    const exact = data.teachers.find(
      (t) =>
        foldText(t.name) === foldText(q) ||
        foldText(t.code).toLowerCase() === foldText(q).toLowerCase() ||
        foldText(t.englishName ?? "").toLowerCase() === foldText(q).toLowerCase() ||
        compact(t.name) === compact(q) ||
        compact(t.code) === compact(q) ||
        compact(t.englishName ?? "") === compact(q),
    );
    if (exact) return exact;
  }

  const lead = chineseLead(raw);
  if (lead) {
    const starts = data.teachers.filter((t) => foldText(t.name).startsWith(lead));
    if (starts.length === 1) return starts[0]!;
  }

  const scored = data.teachers
    .map((t) => ({ t, score: Math.max(...queries.map((q) => teacherMatchScore(t as SearchableTeacher, q))) }))
    .filter((x) => x.score >= 70)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 1) return scored[0]!.t;
  if (scored[0] && scored[0].score >= 90 && (scored[1]?.score ?? 0) < scored[0].score) {
    return scored[0].t;
  }
  return null;
}

function externalTeacher(name: string): Teacher {
  const id = `ext:${compact(name) || name}`;
  return { id, name: foldText(name), code: foldText(name), subjects: [] };
}

function resolveTeacherOrExternal(
  data: ScheduleData,
  rawName: string,
  unmatched: Set<string>,
): Teacher | null {
  const raw = foldText(rawName);
  if (!raw) return null;
  const hit = resolveOfficialTeacher(data, raw);
  if (hit) return hit;
  unmatched.add(raw);
  return externalTeacher(raw);
}

function resolveRoomId(data: ScheduleData, raw: string): string {
  const t = foldText(raw);
  if (!t) return "";
  const compactName = t.replace(/室/g, "");
  const hit = data.rooms.find(
    (r) => r.id === t || r.name === t || r.id === compactName || r.name.replace(/室/g, "") === compactName,
  );
  return hit?.id ?? compactName;
}

const SUBJECT_ALIASES: Record<string, string> = {
  english: "英文",
  chinese: "中文",
  maths: "數學",
  math: "數學",
  英國語文: "英文",
  中國語文: "中文",
  中史: "中史",
  企會計: "會計",
  企會財: "會計",
  校本: "校本課程",
};

function normalizeSubject(raw: string): string {
  const s = foldText(raw).replace(/\s+/g, "");
  if (!s) return "";
  return SUBJECT_ALIASES[s.toLowerCase()] ?? SUBJECT_ALIASES[s] ?? s;
}

export function parseClassSubjectCell(
  data: ScheduleData,
  text: string,
): { classIds: string[]; subject: string } {
  const raw = foldText(text);
  if (!raw) return { classIds: [], subject: "" };
  const tokens = raw.split(/[\s,，、/]+/).filter(Boolean);
  const classIds = new Set<string>();
  const subjectParts: string[] = [];
  for (const token of tokens) {
    const compactToken = token.replace(/\s/g, "").toUpperCase();
    const matched = data.classes.filter((c) => classTokenMatches(compactToken, c.id) || classTokenMatches(token, c.id));
    if (matched.length) {
      matched.forEach((c) => classIds.add(c.id));
      continue;
    }
    if (/^[1-6][A-E]+$/i.test(compactToken) || /IAL/i.test(compactToken) || /^S[1-6]$/i.test(compactToken)) {
      for (const c of data.classes) {
        if (classTokenMatches(compactToken, c.id)) classIds.add(c.id);
      }
      if (![...classIds].length && /^S[4-6]$/i.test(compactToken)) {
        const form = Number(compactToken[1]);
        data.classes.filter((c) => c.form === form).forEach((c) => classIds.add(c.id));
      }
      continue;
    }
    subjectParts.push(token);
  }
  return { classIds: [...classIds], subject: normalizeSubject(subjectParts.join(" ")) };
}

function subjectClose(a: string, b: string): boolean {
  const x = normalizeSubject(a);
  const y = normalizeSubject(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function lessonsAt(
  data: ScheduleData,
  teacherId: string,
  day: DayId,
  periodId: string,
): Lesson[] {
  return data.lessons.filter(
    (l) =>
      l.day === day &&
      l.periodId === periodId &&
      l.teacherIds.includes(teacherId) &&
      (isTeachingLesson(l) || l.periodId === HOMEROOM_PERIOD_ID || l.subject === HOMEROOM_SUBJECT),
  );
}

function pickLesson(
  data: ScheduleData,
  teacherId: string,
  day: DayId,
  periodId: string,
  classIds: string[],
  subject: string,
): Lesson | null {
  const pool = lessonsAt(data, teacherId, day, periodId);
  if (pool.length === 0) return null;
  const byClass = classIds.length
    ? pool.filter((l) => l.classIds.some((id) => classIds.includes(id) || classIds.some((c) => classTokenMatches(c, id))))
    : pool;
  const bySubject = subject
    ? (byClass.length ? byClass : pool).filter((l) => subjectClose(l.subject, subject))
    : byClass;
  return (bySubject[0] ?? byClass[0] ?? pool[0]) ?? null;
}

function slotFromLesson(
  teacher: Teacher,
  periodId: string,
  lesson: Lesson | null,
  classIds: string[],
  subject: string,
  roomId: string,
): CoverSlot {
  return {
    periodId,
    classIds: lesson?.classIds?.length ? [...lesson.classIds] : classIds,
    subject: lesson?.subject || subject || (periodId === HOMEROOM_PERIOD_ID ? HOMEROOM_SUBJECT : ""),
    roomId: lesson?.roomId || roomId,
    teacherId: teacher.id,
    teacherName: teacher.name,
  };
}

function assignmentFrom(
  slot: CoverSlot,
  cover: Teacher,
  reason: string,
  combine: boolean,
): CoverAssignment {
  return {
    periodId: slot.periodId,
    classIds: slot.classIds,
    subject: slot.subject,
    roomId: slot.roomId,
    absenteeId: slot.teacherId,
    absenteeName: slot.teacherName,
    coverTeacherId: cover.id,
    coverTeacherName: cover.name,
    coverBalanceBefore: 0,
    reason,
    ...(combine ? { combine: true } : {}),
  };
}

function swapCanon(s: ConfirmedSwap): string {
  const sameDay = s.leaveDate === s.partnerDate;
  const a = sameDay
    ? `${s.leaveTeacherId}|${s.leaveDate}|${s.leavePeriodId}`
    : `${s.leaveTeacherId}|${s.leaveDate}`;
  const b = sameDay
    ? `${s.partnerTeacherIds[0] ?? ""}|${s.partnerDate}|${s.partnerPeriodId}`
    : `${s.partnerTeacherIds[0] ?? ""}|${s.partnerDate}`;
  return [a, b].sort().join("::");
}

function periodPairs(leave: string[], partner: string[]): SwapPeriodPair[] {
  return leave.map((leavePeriodId, i) => ({
    leavePeriodId,
    partnerPeriodId: partner[i] ?? partner[partner.length - 1] ?? leavePeriodId,
  }));
}

export function resolveOfficialArrangements(
  data: ScheduleData,
  parsed: OfficialArrangementWorkbook,
): OfficialArrangementImport {
  const warnings = [...parsed.warnings];
  const unmatched = new Set<string>();
  const plansByDate = new Map<string, SavedCoverPlan>();
  const swaps: ConfirmedSwap[] = [];
  const seenSwap = new Set<string>();

  const dutiesByDate = new Map<string, CoverDutyNote[]>();
  for (const d of parsed.duties) {
    const teacher = resolveOfficialTeacher(data, d.teacherName);
    const note: CoverDutyNote = {
      kind: d.kind,
      teacherName: teacher?.name ?? d.teacherName,
      teacherId: teacher?.id,
      detail: d.detail,
      location: d.location,
    };
    const list = dutiesByDate.get(d.date) ?? [];
    list.push(note);
    dutiesByDate.set(d.date, list);
    if (!teacher) unmatched.add(d.teacherName);
  }

  for (const row of parsed.rows) {
    const absentee = resolveTeacherOrExternal(data, row.originalTeacher, unmatched);
    if (!absentee) continue;
    const counterpart = resolveTeacherOrExternal(data, row.coverTeacher, unmatched);
    if (row.action === "swap") {
      if (!counterpart) {
        warnings.push(`${row.date} ${row.originalTeacher} 調堂：搵唔到對手老師`);
        continue;
      }
      const partnerDate = partnerDateFromRemark(row.remark, row.date);
      const partnerDay = weekdayFromIsoDate(partnerDate);
      if (!partnerDay) {
        warnings.push(`${row.date} ${row.originalTeacher} 調堂：對手日期 ${partnerDate} 無效`);
        continue;
      }
      const remarkPartnerPeriods = partnerPeriodsFromRemark(row.remark);
      const coverPeriods = remarkPartnerPeriods.length ? remarkPartnerPeriods : row.coverPeriods;
      const leaveInfo = parseClassSubjectCell(data, row.leaveClassSubject);
      const partnerInfo = parseClassSubjectCell(data, row.coverClassSubject);
      const leaveLessons = row.leavePeriods
        .map((periodId) => pickLesson(data, absentee.id, row.day, periodId, leaveInfo.classIds, leaveInfo.subject))
        .filter((l): l is Lesson => Boolean(l));
      const partnerLessons = coverPeriods
        .map((periodId) => pickLesson(data, counterpart.id, partnerDay, periodId, partnerInfo.classIds, partnerInfo.subject))
        .filter((l): l is Lesson => Boolean(l));
      const reasonBits = [row.leaveLabel || "調堂", row.remark].filter(Boolean);
      const record = makeConfirmedSwap({
        leaveTeacherId: absentee.id,
        leaveTeacherName: absentee.name,
        leaveDate: row.date,
        leaveDay: row.day,
        leavePeriodId: row.leavePeriods[0]!,
        leaveLessonIds: leaveLessons.map((l) => l.id),
        leaveSubjects: leaveLessons.length
          ? [...new Set(leaveLessons.map((l) => l.subject))]
          : [leaveInfo.subject].filter(Boolean),
        leaveClassIds: leaveLessons.length
          ? [...new Set(leaveLessons.flatMap((l) => l.classIds))]
          : leaveInfo.classIds,
        partnerDate,
        partnerDay,
        partnerPeriodId: coverPeriods[0] ?? row.leavePeriods[0]!,
        partnerTeacherIds: counterpart.id ? [counterpart.id] : [],
        partnerTeacherNames: [counterpart.name],
        partnerLessonIds: partnerLessons.map((l) => l.id),
        partnerSubjects: partnerLessons.length
          ? [...new Set(partnerLessons.map((l) => l.subject))]
          : [partnerInfo.subject].filter(Boolean),
        partnerClassIds: partnerLessons.length
          ? [...new Set(partnerLessons.flatMap((l) => l.classIds))]
          : partnerInfo.classIds,
        reason: reasonBits.join(" · ") || "通知各部門調堂安排",
        leaveKind: row.leaveKind,
        mode: "period",
        periodPairs: periodPairs(row.leavePeriods, coverPeriods),
      });
      const id = `official-swap-${record.leaveDate}-${record.leaveTeacherId}-${record.leavePeriodId}-${record.partnerDate}-${record.partnerPeriodId}`;
      const saved = { ...record, id };
      const key = swapCanon(saved);
      if (seenSwap.has(key)) continue;
      seenSwap.add(key);
      swaps.push(saved);
      continue;
    }

    if (!counterpart) {
      warnings.push(`${row.date} ${row.originalTeacher}：搵唔到代堂／合班老師「${row.coverTeacher}」`);
    }
    const info = parseClassSubjectCell(data, row.leaveClassSubject);
    const roomId = resolveRoomId(data, row.leaveRoom);
    const reason =
      row.action === "combine"
        ? row.remark
          ? `合班，不計節數 · ${row.remark}`
          : "合班，不計節數"
        : appendHeavyOwnLoadNote(
            [row.leaveLabel || "代堂", row.remark].filter(Boolean).join(" · ") || "通知各部門代堂安排",
            counterpart ? ownTeachingLoadOnDay(data, counterpart.id, row.day) : 0,
          );

    let plan = plansByDate.get(row.date);
    if (!plan) {
      plan = {
        id: `official-cover-${row.date}`,
        confirmedAt: new Date().toISOString(),
        day: row.day,
        date: row.date,
        absentees: [],
        leaveKinds: {},
        slots: [],
        assignments: [],
        leftover: [],
        dutyNotes: dutiesByDate.get(row.date) ?? [],
        source: parsed.source,
      };
      plansByDate.set(row.date, plan);
    }
    if (!plan.absentees.includes(absentee.id)) plan.absentees.push(absentee.id);
    plan.leaveKinds = { ...plan.leaveKinds, [absentee.id]: row.leaveKind };

    for (const periodId of row.leavePeriods) {
      const lesson = absentee.id.startsWith("ext:")
        ? null
        : pickLesson(data, absentee.id, row.day, periodId, info.classIds, info.subject);
      const slot = slotFromLesson(absentee, periodId, lesson, info.classIds, info.subject, roomId);
      if (!plan.slots.some((s) => s.periodId === slot.periodId && s.teacherId === slot.teacherId && s.subject === slot.subject)) {
        plan.slots.push(slot);
      }
      if (!counterpart) {
        if (!plan.leftover.some((s) => s.periodId === slot.periodId && s.teacherId === slot.teacherId)) {
          plan.leftover.push(slot);
        }
        continue;
      }
      const a = assignmentFrom(slot, counterpart, reason, row.action === "combine");
      const exists = plan.assignments.some(
        (x) => x.periodId === a.periodId && x.absenteeId === a.absenteeId && x.subject === a.subject,
      );
      if (!exists) plan.assignments.push(a);
    }
  }

  const plans = [...plansByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const unmatchedTeachers = [...unmatched].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  if (unmatchedTeachers.length) {
    warnings.push(`名單對唔上時間表：${unmatchedTeachers.join("、")}`);
  }

  return {
    plans,
    swaps: swaps.sort((a, b) => a.leaveDate.localeCompare(b.leaveDate) || a.leavePeriodId.localeCompare(b.leavePeriodId)),
    warnings,
    summary: {
      dates: [...new Set([...plans.map((p) => p.date), ...swaps.map((s) => s.leaveDate)])].sort(),
      coverCount: plans.reduce((n, p) => n + p.assignments.filter((a) => !a.combine).length, 0),
      combineCount: plans.reduce((n, p) => n + p.assignments.filter((a) => a.combine).length, 0),
      swapCount: swaps.length,
      leftoverCount: plans.reduce((n, p) => n + p.leftover.length, 0),
      unmatchedTeachers,
    },
  };
}

export function mergeOfficialArrangementImport(
  cover: { balances: CoverBalances; plans: SavedCoverPlan[] },
  existingSwaps: ConfirmedSwap[],
  incoming: OfficialArrangementImport,
): { balances: CoverBalances; plans: SavedCoverPlan[]; swaps: ConfirmedSwap[] } {
  const leaveDates = new Set<string>([
    ...incoming.plans.map((p) => p.date),
    ...incoming.swaps.map((s) => s.leaveDate),
  ]);
  let balances = { ...cover.balances };
  const remainingPlans = cover.plans.filter((p) => !leaveDates.has(p.date));
  for (const old of cover.plans.filter((p) => leaveDates.has(p.date))) {
    balances = undoBalances(balances, old);
  }
  const stamped = incoming.plans.map((p) => ({
    ...p,
    confirmedAt: p.confirmedAt || new Date().toISOString(),
  }));
  for (const plan of stamped) {
    balances = applyBalances(balances, plan);
  }
  const plans = [...stamped, ...remainingPlans]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 80);
  const remainingSwaps = existingSwaps.filter((s) => !leaveDates.has(s.leaveDate));
  const swaps = [...incoming.swaps, ...remainingSwaps].slice(0, 200);
  return { balances, plans, swaps };
}

export function officialImportPreviewLines(incoming: OfficialArrangementImport): string[] {
  const s = incoming.summary;
  const lines = [
    `已讀到 ${s.dates.length} 個上課日`,
    `代堂 ${s.coverCount} 堂、合班 ${s.combineCount} 堂、調堂 ${s.swapCount} 項`,
  ];
  if (s.leftoverCount) lines.push(`未編 ${s.leftoverCount} 堂（搵唔到代堂人）`);
  if (s.unmatchedTeachers.length) {
    lines.push(`對唔上時間表嘅姓名：${s.unmatchedTeachers.join("、")}`);
  }
  return lines;
}

export function isOfficialArrangementWorkbook(parsed: OfficialArrangementWorkbook): boolean {
  return parsed.rows.length > 0 || parsed.emptyDates.length > 0;
}

export type { CoverPlan };
