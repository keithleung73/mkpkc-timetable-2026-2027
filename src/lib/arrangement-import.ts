import * as XLSX from "xlsx";
import {
  applyBalances,
  type CoverAssignment,
  type CoverBalances,
  type CoverPlan,
  type CoverSlot,
  type SavedCoverPlan,
  undoBalances,
  weekdayFromIsoDate,
} from "./cover";
import { HOMEROOM_PERIOD } from "./constants";
import { classTokenMatches } from "./queries";
import { isResignedTeacher } from "./schedule-corrections";
import { teacherMatchScore } from "./search";
import type { SavedSwapRecord } from "./swap-records";
import type { DayId, Lesson, ScheduleData, Teacher } from "./types";

export type ArrangementAction = "cover" | "swap" | "combine";
export type ArrangementLeaveKind = "personal" | "sick" | "official";

export type ArrangementLessonRow = {
  sheet: string;
  date: string;
  day: DayId;
  originalTeacher: string;
  leaveLabel: string;
  leaveKind: ArrangementLeaveKind;
  action: ArrangementAction;
  leavePeriods: string[];
  leaveClassSubject: string;
  leaveRoom: string;
  coverTeacher: string;
  coverPeriods: string[];
  coverClassSubject: string;
  coverRoom: string;
  remark: string;
};

export type ArrangementWorkbook = {
  source: string;
  rows: ArrangementLessonRow[];
  warnings: string[];
};

export type ArrangementImport = {
  plans: SavedCoverPlan[];
  swaps: SavedSwapRecord[];
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
  mirza: "MIRZ",
  mirz: "MIRZ",
  roisin: "ROIS",
  rois: "ROIS",
  郭嘉銘: "銘",
  郭家銘: "銘",
  范嘉揚: "NIC",
  范嘉楊: "NIC",
};

const SUBJECT_ALIASES: Record<string, string> = {
  中文: "中文",
  中國語文: "中文",
  英文: "英文",
  英國語文: "英文",
  數學: "數學",
  普話: "普話",
  普通話: "普話",
  地理: "地理",
};

function foldText(raw: string): string {
  return String(raw ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/強/g, "强")
    .trim();
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

/** 學務部日期：日/月/年，或工作表名月-日。 */
export function parseArrangementDate(text: string, defaultYear = 2026): string | null {
  const s = foldText(text).replace(/\s/g, "");
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/.年-](\d{1,2})[/.月-](\d{2,4})/);
  if (m) {
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return isoDateFromParts(year, Number(m[2]), Number(m[1]));
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return isoDateFromParts(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/.月-](\d{1,2})$/);
  if (m) return isoDateFromParts(defaultYear, Number(m[2]), Number(m[1]));
  return null;
}

export function parseArrangementPeriods(text: string): string[] {
  const s = foldText(text);
  if (!s) return [];
  if (/班主任/.test(s)) return [HOMEROOM_PERIOD.id];
  const cleaned = s.replace(/整理節/g, " ").replace(/lesson/gi, " ").replace(/第/g, " ").replace(/節/g, " ");
  const nums = [...cleaned.matchAll(/\b(10|[1-9])\b/g)].map((m) => Number(m[1]));
  return [...new Set(nums)].filter((n) => n >= 1 && n <= 10).map((n) => `p${n}`);
}

export function parseArrangementLeaveKind(text: string): ArrangementLeaveKind {
  const s = foldText(text);
  if (/事假/.test(s)) return "personal";
  if (/病假/.test(s)) return "sick";
  return "official";
}

export function parseArrangementAction(text: string): ArrangementAction | null {
  const s = foldText(text);
  if (/合班/.test(s)) return "combine";
  if (/調堂/.test(s)) return "swap";
  if (/代堂|代課/.test(s)) return "cover";
  return null;
}

function datesInRemark(remark: string, sheetDate: string): string[] {
  const year = Number(sheetDate.slice(0, 4)) || 2026;
  const out: string[] = [];
  const re = /(\d{1,2})\s*[/.月-]\s*(\d{1,2})(?:\s*[/.年-]\s*(\d{2,4}))?/g;
  for (const m of foldText(remark).matchAll(re)) {
    const y = m[3] ? (Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])) : year;
    const iso = isoDateFromParts(y, Number(m[2]), Number(m[1]));
    if (iso && iso !== sheetDate) out.push(iso);
  }
  return [...new Set(out)];
}

function partnerDateFromRemark(remark: string, sheetDate: string): string {
  const arrow = foldText(remark).split(/->|→|⇒/)[1];
  if (arrow) {
    const fromArrow = datesInRemark(arrow, sheetDate)[0];
    if (fromArrow) return fromArrow;
  }
  return datesInRemark(remark, sheetDate)[0] ?? sheetDate;
}

function partnerPeriodsFromRemark(remark: string): string[] {
  const arrow = foldText(remark).split(/->|→|⇒/)[1];
  if (!arrow) return [];
  const lesson = arrow.match(/lesson\s*([0-9及和、,，\s]+)/i);
  return lesson ? parseArrangementPeriods(lesson[1]) : parseArrangementPeriods(arrow);
}

function dateFromSheetName(name: string, year: number): string | null {
  const m = foldText(name).match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  return isoDateFromParts(year, Number(m[1]), Number(m[2]));
}

function looksLikeHeaderRow(row: unknown[]): boolean {
  const line = row.map((c) => foldText(String(c ?? ""))).join(" ");
  return /原課堂老師|Original Teacher/.test(line);
}

export function parseArrangementWorkbook(
  input: ArrayBuffer | Uint8Array | Buffer,
  opts?: { source?: string; year?: number },
): ArrangementWorkbook {
  const wb = XLSX.read(input, { type: "array", cellDates: false, raw: false });
  const year = opts?.year ?? 2026;
  const source = opts?.source ?? "通知各部門調堂代堂安排";
  const rows: ArrangementLessonRow[] = [];
  const warnings: string[] = [];

  for (const sheet of wb.SheetNames) {
    if (/sample|範本|樣本/i.test(sheet)) continue;
    const ws = wb.Sheets[sheet];
    if (!ws) continue;
    const table = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][];
    const dateCell = cell(table[0] ?? [], 1) || cell(table[0] ?? [], 0);
    const date = parseArrangementDate(dateCell, year) ?? dateFromSheetName(sheet, year);
    if (!date) {
      warnings.push(`工作表「${sheet}」無法辨識日期`);
      continue;
    }
    const day = weekdayFromIsoDate(date);
    if (!day) {
      warnings.push(`${date}（${sheet}）唔係上課日`);
      continue;
    }

    let inLessons = false;
    for (const raw of table.slice(1)) {
      if (!raw || raw.every((c) => !foldText(String(c ?? "")))) continue;
      if (looksLikeHeaderRow(raw)) {
        inLessons = true;
        continue;
      }
      if (/老師當值|Teacher on Duty|課外活動/.test(raw.map((c) => foldText(String(c ?? ""))).join(" "))) {
        inLessons = false;
        continue;
      }
      if (!inLessons) continue;
      const originalTeacher = cell(raw, 1);
      const action = parseArrangementAction(cell(raw, 3));
      if (!originalTeacher || !action) continue;
      const leavePeriods = parseArrangementPeriods(cell(raw, 4));
      if (leavePeriods.length === 0) {
        warnings.push(`${date} ${originalTeacher}：無法辨識節數「${cell(raw, 4)}」`);
        continue;
      }
      const coverPeriods = parseArrangementPeriods(cell(raw, 8));
      rows.push({
        sheet,
        date,
        day,
        originalTeacher,
        leaveLabel: cell(raw, 2),
        leaveKind: parseArrangementLeaveKind(cell(raw, 2)),
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
    }
  }

  return { source, rows, warnings };
}

function isLamName(raw: string): boolean {
  const s = foldText(raw);
  return s === "彤" || s.includes("林紀彤") || s.includes("林紀形");
}

function findTeacher(data: ScheduleData, rawName: string): Teacher | null {
  const raw = foldText(rawName);
  if (!raw) return null;
  const alias = TEACHER_ALIASES[raw.toLowerCase()] ?? TEACHER_ALIASES[compact(raw)];
  const queries = [alias, raw].filter(Boolean) as string[];
  for (const q of queries) {
    const exact = data.teachers.find(
      (t) =>
        foldText(t.name) === foldText(q) ||
        foldText(t.code).toLowerCase() === foldText(q).toLowerCase() ||
        foldText(t.englishName ?? "").toLowerCase() === foldText(q).toLowerCase() ||
        compact(t.name) === compact(q) ||
        compact(t.code) === compact(q),
    );
    if (exact) return exact;
  }
  let best: Teacher | null = null;
  let bestScore = 0;
  for (const t of data.teachers) {
    if (isResignedTeacher(t.id)) continue;
    const score = Math.max(teacherMatchScore(t, raw), alias ? teacherMatchScore(t, alias) : 0);
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return bestScore >= 80 ? best : null;
}

function externalTeacher(rawName: string): Teacher {
  const name = foldText(rawName);
  return { id: `ext:${compact(name)}`, name, code: name, subjects: [] };
}

function resolvePerson(
  data: ScheduleData,
  rawName: string,
  role: "absent" | "cover",
  unmatched: Set<string>,
  warnings: string[],
  date: string,
): Teacher | null {
  if (isLamName(rawName)) {
    if (role === "cover") {
      warnings.push(`${date}：林紀彤已辭職，不安排代堂`);
      return null;
    }
    const yu = data.teachers.find((t) => t.id === "余" || t.code === "余");
    if (yu) return yu;
  }
  const found = findTeacher(data, rawName);
  if (found) {
    if (role === "cover" && (isResignedTeacher(found.id) || found.name.includes("已辭職"))) {
      warnings.push(`${date}：${found.name}不安排代堂`);
      return null;
    }
    return found;
  }
  unmatched.add(foldText(rawName));
  return externalTeacher(rawName);
}

function parseClassSubject(data: ScheduleData, text: string): { classIds: string[]; subject: string } {
  const raw = foldText(text);
  if (!raw) return { classIds: [], subject: "" };
  const classIds = new Set<string>();
  const subjectParts: string[] = [];
  for (const token of raw.split(/[\s,，、/]+/).filter(Boolean)) {
    const compactToken = token.replace(/\s/g, "").toUpperCase();
    const matched = data.classes.filter(
      (c) => classTokenMatches(compactToken, c.id) || classTokenMatches(token, c.id),
    );
    if (matched.length) {
      matched.forEach((c) => classIds.add(c.id));
      continue;
    }
    subjectParts.push(token);
  }
  const subjectRaw = subjectParts.join("");
  const subject = SUBJECT_ALIASES[subjectRaw] ?? SUBJECT_ALIASES[subjectRaw.toLowerCase()] ?? subjectRaw;
  return { classIds: [...classIds], subject };
}

function subjectClose(a: string, b: string): boolean {
  const x = SUBJECT_ALIASES[a] ?? a;
  const y = SUBJECT_ALIASES[b] ?? b;
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function pickLesson(
  data: ScheduleData,
  teacherId: string,
  day: DayId,
  periodId: string,
  classIds: string[],
  subject: string,
): Lesson | null {
  const pool = data.lessons.filter(
    (l) => l.day === day && l.periodId === periodId && l.teacherIds.includes(teacherId) && l.kind !== "meeting",
  );
  if (pool.length === 0) return null;
  const byClass = classIds.length
    ? pool.filter((l) => l.classIds.some((id) => classIds.includes(id)))
    : pool;
  const narrowed = subject ? (byClass.length ? byClass : pool).filter((l) => subjectClose(l.subject, subject)) : byClass;
  return narrowed[0] ?? byClass[0] ?? pool[0] ?? null;
}

function resolveRoomId(data: ScheduleData, raw: string): string {
  const s = foldText(raw);
  if (!s) return "";
  const hit = data.rooms.find((r) => r.id === s || r.name === s || r.name.replace(/室$/, "") === s.replace(/室$/, ""));
  return hit?.id ?? s;
}

function skipBalanceFor(kind: ArrangementLeaveKind, action: ArrangementAction): boolean {
  return action === "combine" || kind === "official";
}

export function resolveArrangements(data: ScheduleData, parsed: ArrangementWorkbook): ArrangementImport {
  const warnings = [...parsed.warnings];
  const unmatched = new Set<string>();
  const plansByDate = new Map<string, SavedCoverPlan>();
  const swaps: SavedSwapRecord[] = [];
  const seenSwap = new Set<string>();
  const now = new Date().toISOString();

  for (const row of parsed.rows) {
    const absentee = resolvePerson(data, row.originalTeacher, "absent", unmatched, warnings, row.date);
    if (!absentee) continue;
    const counterpart = row.coverTeacher
      ? resolvePerson(data, row.coverTeacher, row.action === "swap" ? "absent" : "cover", unmatched, warnings, row.date)
      : null;
    const leaveInfo = parseClassSubject(data, row.leaveClassSubject);
    const partnerInfo = parseClassSubject(data, row.coverClassSubject);

    if (row.action === "swap") {
      if (!counterpart) {
        warnings.push(`${row.date} ${row.originalTeacher} 調堂：搵唔到對手老師`);
        continue;
      }
      const partnerDate = partnerDateFromRemark(row.remark, row.date);
      const partnerDay = weekdayFromIsoDate(partnerDate);
      if (!partnerDay) {
        warnings.push(`${row.date} ${row.originalTeacher} 調堂：對手日期無效`);
        continue;
      }
      const partnerPeriods = partnerPeriodsFromRemark(row.remark);
      const coverPeriods = partnerPeriods.length ? partnerPeriods : row.coverPeriods;
      const key = [
        absentee.id,
        row.date,
        row.leavePeriods[0],
        counterpart.id,
        partnerDate,
        coverPeriods[0] ?? row.leavePeriods[0],
      ].join("|");
      const reverse = [
        counterpart.id,
        partnerDate,
        coverPeriods[0] ?? row.leavePeriods[0],
        absentee.id,
        row.date,
        row.leavePeriods[0],
      ].join("|");
      if (seenSwap.has(key) || seenSwap.has(reverse)) continue;
      seenSwap.add(key);
      const leaveLesson = pickLesson(
        data,
        absentee.id,
        row.day,
        row.leavePeriods[0]!,
        leaveInfo.classIds,
        leaveInfo.subject,
      );
      const partnerLesson = pickLesson(
        data,
        counterpart.id,
        partnerDay,
        coverPeriods[0] ?? row.leavePeriods[0]!,
        partnerInfo.classIds,
        partnerInfo.subject,
      );
      swaps.push({
        id: `swap-${key}`,
        leaveTeacherId: absentee.id,
        leaveTeacherName: absentee.name,
        leaveDate: row.date,
        leaveDay: row.day,
        leavePeriodIds: row.leavePeriods,
        leaveClassIds: leaveLesson?.classIds?.length ? [...leaveLesson.classIds] : leaveInfo.classIds,
        leaveSubject: leaveLesson?.subject || leaveInfo.subject,
        partnerTeacherId: counterpart.id,
        partnerTeacherName: counterpart.name,
        partnerDate,
        partnerDay,
        partnerPeriodIds: coverPeriods,
        partnerClassIds: partnerLesson?.classIds?.length ? [...partnerLesson.classIds] : partnerInfo.classIds,
        partnerSubject: partnerLesson?.subject || partnerInfo.subject,
        reason: [row.leaveLabel || "調堂", row.remark].filter(Boolean).join(" · "),
        savedAt: now,
      });
      continue;
    }

    const skipBalance = skipBalanceFor(row.leaveKind, row.action);
    const roomId = resolveRoomId(data, row.leaveRoom);
    const reason =
      row.action === "combine"
        ? row.remark
          ? `合班，不計節數 · ${row.remark}`
          : "合班，不計節數"
        : [row.leaveLabel || "代堂", row.remark].filter(Boolean).join(" · ") || "通知各部門代堂安排";

    let plan = plansByDate.get(row.date);
    if (!plan) {
      plan = {
        id: `import-cover-${row.date}`,
        confirmedAt: now,
        day: row.day,
        date: row.date,
        absentees: [],
        slots: [],
        assignments: [],
        leftover: [],
      };
      plansByDate.set(row.date, plan);
    }
    if (!plan.absentees.includes(absentee.id)) plan.absentees.push(absentee.id);

    for (const periodId of row.leavePeriods) {
      const lesson = absentee.id.startsWith("ext:")
        ? null
        : pickLesson(data, absentee.id, row.day, periodId, leaveInfo.classIds, leaveInfo.subject);
      const slot: CoverSlot = {
        periodId,
        classIds: lesson?.classIds?.length ? [...lesson.classIds] : leaveInfo.classIds,
        subject: lesson?.subject || leaveInfo.subject || (periodId === HOMEROOM_PERIOD.id ? HOMEROOM_PERIOD.label : ""),
        roomId: lesson?.roomId || roomId,
        teacherId: absentee.id,
        teacherName: absentee.name,
        skipBalance,
      };
      if (!plan.slots.some((s) => s.periodId === slot.periodId && s.teacherId === slot.teacherId && s.subject === slot.subject)) {
        plan.slots.push(slot);
      }
      if (!counterpart) {
        if (!plan.leftover.some((s) => s.periodId === slot.periodId && s.teacherId === slot.teacherId)) {
          plan.leftover.push(slot);
        }
        continue;
      }
      const assignment: CoverAssignment = {
        periodId: slot.periodId,
        classIds: slot.classIds,
        subject: slot.subject,
        roomId: slot.roomId,
        absenteeId: slot.teacherId,
        absenteeName: slot.teacherName,
        coverTeacherId: counterpart.id,
        coverTeacherName: counterpart.name,
        coverBalanceBefore: 0,
        reason,
        skipBalance,
      };
      const exists = plan.assignments.some(
        (x) => x.periodId === assignment.periodId && x.absenteeId === assignment.absenteeId && x.subject === assignment.subject,
      );
      if (!exists) plan.assignments.push(assignment);
    }
  }

  const plans = [...plansByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const unmatchedTeachers = [...unmatched].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  if (unmatchedTeachers.length) warnings.push(`名單對唔上時間表：${unmatchedTeachers.join("、")}`);

  return {
    plans,
    swaps: swaps.sort((a, b) => a.leaveDate.localeCompare(b.leaveDate)),
    warnings,
    summary: {
      dates: [...new Set([...plans.map((p) => p.date), ...swaps.map((s) => s.leaveDate)])].sort(),
      coverCount: plans.reduce((n, p) => n + p.assignments.filter((a) => !a.reason.startsWith("合班")).length, 0),
      combineCount: plans.reduce((n, p) => n + p.assignments.filter((a) => a.reason.startsWith("合班")).length, 0),
      swapCount: swaps.length,
      leftoverCount: plans.reduce((n, p) => n + p.leftover.length, 0),
      unmatchedTeachers,
    },
  };
}

export function officialImportPreviewLines(incoming: ArrangementImport): string[] {
  const s = incoming.summary;
  const lines = [
    `已讀到 ${s.dates.length} 個上課日`,
    `代堂 ${s.coverCount} 堂、合班 ${s.combineCount} 堂、調堂 ${s.swapCount} 項`,
  ];
  if (s.leftoverCount) lines.push(`未編 ${s.leftoverCount} 堂（沒有可代的老師）`);
  if (s.unmatchedTeachers.length) lines.push(`對唔上時間表嘅姓名：${s.unmatchedTeachers.join("、")}`);
  return lines;
}

export function mergeArrangementImport(
  cover: { balances: CoverBalances; plans: SavedCoverPlan[] },
  existingSwaps: SavedSwapRecord[],
  incoming: ArrangementImport,
): { balances: CoverBalances; plans: SavedCoverPlan[]; swaps: SavedSwapRecord[] } {
  const dates = new Set<string>([
    ...incoming.plans.map((p) => p.date),
    ...incoming.swaps.map((s) => s.leaveDate),
  ]);
  let balances = { ...cover.balances };
  const keptPlans = cover.plans.filter((p) => !dates.has(p.date));
  for (const old of cover.plans.filter((p) => dates.has(p.date))) {
    balances = undoBalances(balances, old);
  }
  const stamped = incoming.plans.map((p) => ({
    ...p,
    confirmedAt: p.confirmedAt || new Date().toISOString(),
  }));
  for (const plan of stamped) balances = applyBalances(balances, plan);
  const plans = [...stamped, ...keptPlans].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 80);
  const swaps = [...incoming.swaps, ...existingSwaps.filter((s) => !dates.has(s.leaveDate))].slice(0, 200);
  return { balances, plans, swaps };
}

export function isArrangementWorkbook(parsed: ArrangementWorkbook): boolean {
  return parsed.rows.length > 0;
}

export type { CoverPlan };
