import * as XLSX from "xlsx";
import { isCoreSubject } from "./constants";
import type { DayId, Lesson, Room, ScheduleData, SchoolClass, Teacher } from "./types";

const SKIP =
  /^(早會|早會\/班主任節|班主任節|小息|午膳|學習重點整理|學習重點整理隨課節|全人教育|Revision|Morning|Recess|Lunch|Class Teacher)/i;

const MON_THU_ROW: Record<number, string> = {
  3: "p1", // 0-index row 3 = R4
  4: "p2",
  7: "p3",
  8: "p4",
  11: "p5",
  12: "p6",
  15: "p7",
  16: "p8",
  18: "p9",
  19: "p10",
};

const DAY_COLS: { col: number; day: DayId }[] = [
  { col: 1, day: "mon" },
  { col: 2, day: "tue" },
  { col: 3, day: "wed" },
  { col: 4, day: "thu" },
  { col: 5, day: "fri" },
];

const HOME_ROOMS: Record<string, string> = {
  "1A": "201",
  "1B": "202",
  "1C": "203",
  "1D": "205",
  "1E": "206",
  "2A": "301",
  "2B": "302",
  "2C": "303",
  "2D": "305",
  "2E": "213",
  "3A": "401",
  "3B": "402",
  "3C": "403",
  "3D": "405",
  "3E": "210",
  "4A": "610",
  "4B": "613",
  "4C": "406",
  "4D": "306",
  "4E": "404A",
  "4E-IAL": "310",
  "5A": "501",
  "5B": "502",
  "5C": "503",
  "5D": "505",
  "5E": "504A",
  "5E-IAL": "506",
  "6A": "601",
  "6B": "602",
  "6C": "603",
  "6D": "605",
  "6E": "604A",
  "6E-IAL": "606",
};

function expandMerges(ws: XLSX.WorkSheet, matrix: string[][]) {
  for (const m of ws["!merges"] || []) {
    const val = matrix[m.s.r]?.[m.s.c] ?? "";
    for (let r = m.s.r; r <= m.e.r; r++) {
      if (!matrix[r]) matrix[r] = [];
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (!String(matrix[r][c] ?? "").trim()) matrix[r][c] = val;
      }
    }
  }
}

function sheetMatrix(ws: XLSX.WorkSheet): string[][] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: false,
    defval: "",
  });
  const matrix = rows.map((row) =>
    (Array.isArray(row) ? row : []).map((v) => String(v ?? "")),
  );
  expandMerges(ws, matrix);
  return matrix;
}

function looksLikeRoom(line: string): boolean {
  const t = line.replace(/\s/g, "");
  return /^(N?\d{2,4}[A-Z]?|C[1-3]|D-?Expo)$/i.test(t);
}

function parseClasses(text: string): string[] {
  const out: string[] = [];
  const re = /[1-6]IAL|[1-6][A-E]G\d|[1-6][A-E]/g;
  const used = new Set<string>();
  const raw = text.toUpperCase();
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    let tok = m[0];
    if (tok === "4IAL") tok = "4E-IAL";
    if (tok === "5IAL") tok = "5E-IAL";
    if (tok === "6IAL") tok = "6E-IAL";
    if (used.has(tok)) continue;
    used.add(tok);
    out.push(tok);
  }
  return out;
}

function stripFridayClock(text: string): string {
  return text
    .replace(/^(上午|下午)?\s*\d{1,2}\s*:\s*\d{2}\s*[-–至]\s*(上午|下午)?\s*\d{1,2}\s*:\s*\d{2}\s*/gim, "")
    .replace(/^\(\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\)\s*/gim, "")
    .trim();
}

function parseCell(raw: string): Omit<Lesson, "id" | "day" | "periodId" | "teacherIds"> | null {
  let text = String(raw || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();
  if (!text) return null;
  text = stripFridayClock(text);
  const flat = text.replace(/\s+/g, "");
  if (!flat || SKIP.test(flat) || SKIP.test(text.split("\n")[0].replace(/\s+/g, ""))) return null;

  const isMeeting = /^(CLP|學務|生涯會|學生部|首席會|部會)/.test(flat) || /會議/.test(flat);
  const lines = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let roomId = "";
  if (lines.length && looksLikeRoom(lines[lines.length - 1])) {
    roomId = lines.pop()!.replace(/\s/g, "");
  } else {
    const last = lines[lines.length - 1] ?? "";
    const rm = last.match(/(\S+)$/);
    if (rm && looksLikeRoom(rm[1])) {
      roomId = rm[1].replace(/\s/g, "");
      lines[lines.length - 1] = last.slice(0, last.length - rm[1].length).trim();
    }
  }

  const blob = lines.join(" ");
  const classIds = isMeeting ? [] : parseClasses(blob);
  let subject = blob;
  for (const id of [...classIds].sort((a, b) => b.length - a.length)) {
    const token = id.replace("-IAL", "IAL");
    subject = subject.replace(new RegExp(token, "ig"), "");
  }
  subject = subject.replace(/[,，]/g, " ").replace(/\s+/g, " ").trim() || (isMeeting ? blob : "課堂");

  const looksGrouped =
    !isMeeting &&
    !isCoreSubject(subject) &&
    (classIds.length > 1 || classIds.some((x) => /G\d|IAL/.test(x)));

  return {
    classIds,
    subject,
    roomId,
    // 核心科（如公民）即使合班上亦唔標「分組／選修」，避免調堂誤判
    note: looksGrouped ? "分組／選修" : undefined,
    kind: isMeeting ? "meeting" : "lesson",
  };
}

function parseHeader(firstCell: string, sheetName: string): { name: string; englishName?: string } {
  const line = firstCell.replace(/^時間表[：:]\s*/i, "").replace(/^Timetable:\s*/i, "").trim();
  const parts = line.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const chinese = parts.find((p) => /[\u4e00-\u9fff]/.test(p));
    const english = parts.find((p) => /[A-Za-z]/.test(p));
    return { name: chinese || sheetName, englishName: english };
  }
  if (/[A-Za-z]/.test(line) && !/[\u4e00-\u9fff]/.test(line)) {
    return { name: sheetName, englishName: line };
  }
  return { name: line || sheetName };
}

export function parseTeacherTimetableWorkbook(buffer: Buffer | ArrayBuffer): {
  teachers: Teacher[];
  lessons: Lesson[];
} {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const teachers: Teacher[] = [];
  const lessons: Lesson[] = [];
  let seq = 0;

  for (const sheetName of wb.SheetNames) {
    if (/\(ENG\)/i.test(sheetName)) continue;
    const matrix = sheetMatrix(wb.Sheets[sheetName]);
    if (matrix.length < 8) continue;
    const header = parseHeader(matrix[0]?.[0] ?? "", sheetName);
    const code = sheetName.trim();
    const subjects = new Set<string>();

    for (const { col, day } of DAY_COLS) {
      for (const [rowStr, periodId] of Object.entries(MON_THU_ROW)) {
        const r = Number(rowStr);
        const parsed = parseCell(matrix[r]?.[col] ?? "");
        if (!parsed) continue;
        if (day === "fri" && periodId === "p9") continue;
        seq += 1;
        if (parsed.kind !== "meeting" && parsed.subject) subjects.add(parsed.subject.split(" ")[0] ?? parsed.subject);
        lessons.push({
          id: `${code}-${seq}`,
          day,
          periodId,
          teacherIds: [code],
          ...parsed,
        });
      }
    }

    teachers.push({
      id: code,
      name: header.name,
      code,
      subjects: [...subjects],
      englishName: header.englishName,
    });
  }

  return { teachers, lessons };
}

export function parseAssignmentWorkbook(buffer: Buffer | ArrayBuffer): {
  classTeachers: Record<string, string[]>;
  subjects: Record<string, string[]>;
} {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    raw: false,
    defval: "",
  });
  const classTeachers: Record<string, string[]> = {};
  const subjects: Record<string, string[]> = {};
  for (let i = 1; i < rows.length; i++) {
    const row = (rows[i] || []) as unknown[];
    const code = String(row[2] ?? "").trim();
    if (!code) continue;
    const cls = String(row[6] ?? "").replace(/\s/g, "");
    if (cls) {
      classTeachers[cls] ??= [];
      classTeachers[cls].push(code);
    }
    const subs: string[] = [];
    for (let c = 7; c <= 22; c++) {
      const v = String(row[c] ?? "").trim();
      if (v && !/^\d+$/.test(v)) subs.push(v.replace(/\s+/g, " "));
    }
    subjects[code] = subs;
  }
  return { classTeachers, subjects };
}

function buildClasses(classTeachers: Record<string, string[]>): SchoolClass[] {
  const classes: SchoolClass[] = [];
  const letters = ["A", "B", "C", "D", "E"];
  for (const form of [1, 2, 3, 4, 5, 6]) {
    for (const letter of letters) {
      const name = `${form}${letter}`;
      classes.push({
        id: name,
        name,
        form,
        homeRoom: HOME_ROOMS[name] ?? "",
        classTeacherIds: classTeachers[name] ?? [],
      });
    }
  }
  for (const id of ["4E-IAL", "5E-IAL", "6E-IAL"] as const) {
    classes.push({
      id,
      name: id.replace("-", " "),
      form: Number(id[0]),
      stream: "IAL",
      homeRoom: HOME_ROOMS[id] ?? "",
      classTeacherIds: classTeachers[id] ?? [],
    });
  }
  return classes;
}

function collectRooms(lessons: Lesson[], classes: SchoolClass[]): Room[] {
  const map = new Map<string, Room>();
  for (const c of classes) {
    if (c.homeRoom) {
      map.set(c.homeRoom, { id: c.homeRoom, name: `${c.homeRoom}室`, kind: "classroom" });
    }
  }
  for (const l of lessons) {
    if (!l.roomId || map.has(l.roomId)) continue;
    map.set(l.roomId, {
      id: l.roomId,
      name: l.roomId,
      kind: /^[NC]/i.test(l.roomId) ? "special" : "classroom",
    });
  }
  return [...map.values()];
}

export function buildOfficialSchedule(
  timetableBuffer: Buffer,
  assignmentBuffer?: Buffer,
): ScheduleData {
  const { teachers, lessons } = parseTeacherTimetableWorkbook(timetableBuffer);
  let classTeachers: Record<string, string[]> = {};
  if (assignmentBuffer) {
    const extra = parseAssignmentWorkbook(assignmentBuffer);
    classTeachers = extra.classTeachers;
    const byCode = new Map(teachers.map((t) => [t.code.toLowerCase(), t]));
    for (const [code, subs] of Object.entries(extra.subjects)) {
      const t = byCode.get(code.toLowerCase());
      if (t && subs.length) t.subjects = Array.from(new Set([...t.subjects, ...subs]));
    }
  }
  const classes = buildClasses(classTeachers);
  return {
    meta: {
      school: "萬鈞伯裘書院",
      schoolEn: "Man Kwan Pak Kau College",
      year: "2026-2027",
      updatedAt: new Date().toISOString(),
      source: "2. (2026-2027) 教師時間表(31-08-2026)",
    },
    teachers,
    classes,
    rooms: collectRooms(lessons, classes),
    lessons,
  };
}
