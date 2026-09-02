import * as XLSX from "xlsx";
import type { DayId, Lesson, ScheduleData } from "./types";
import { ABBR_TO_SUBJECT, DAYS, SUBJECT_ABBR } from "./constants";
import { generateSeed } from "./seed";

const DAY_ALIASES: Record<string, DayId> = {
  星期一: "mon",
  星期二: "tue",
  星期三: "wed",
  星期四: "thu",
  星期五: "fri",
  周一: "mon",
  周二: "tue",
  周三: "wed",
  周四: "thu",
  周五: "fri",
  一: "mon",
  二: "tue",
  三: "wed",
  四: "thu",
  五: "fri",
  mon: "mon",
  tue: "tue",
  wed: "wed",
  thu: "thu",
  fri: "fri",
  monday: "mon",
  tuesday: "tue",
  wednesday: "wed",
  thursday: "thu",
  friday: "fri",
};

const PERIOD_ALIASES: Record<string, string> = {
  第一節: "p1",
  第二節: "p2",
  第三節: "p3",
  第四節: "p4",
  第五節: "p5",
  第六節: "p6",
  第七節: "p7",
  第八節: "p8",
  第九節: "p9",
  自主學習: "p9",
  學習反思及自主學習課: "p9",
  p1: "p1",
  p2: "p2",
  p3: "p3",
  p4: "p4",
  p5: "p5",
  p6: "p6",
  p7: "p7",
  p8: "p8",
  p9: "p9",
};

export type ImportReport = {
  files: string[];
  sheets: string[];
  lessons: number;
  teachers: number;
  classes: number;
  rooms: number;
  warnings: string[];
};

function norm(v: unknown): string {
  return String(v ?? "")
    .replace(/\r/g, "")
    .replace(/\u3000/g, " ")
    .trim();
}

function detectDay(text: string): DayId | undefined {
  const t = text.replace(/\s/g, "").toLowerCase();
  for (const [k, v] of Object.entries(DAY_ALIASES)) {
    if (t === k.toLowerCase() || t.startsWith(k.toLowerCase())) return v;
  }
  return undefined;
}

function detectPeriod(text: string): string | undefined {
  const t = text.replace(/\s/g, "");
  if (PERIOD_ALIASES[t]) return PERIOD_ALIASES[t];
  const m =
    t.match(/^第?([1-8一二三四五六七八])節?$/) ||
    t.match(/^p?([1-8])$/i) ||
    t.match(/第([1-8])堂/);
  if (m) {
    const map: Record<string, string> = {
      "1": "p1",
      "2": "p2",
      "3": "p3",
      "4": "p4",
      "5": "p5",
      "6": "p6",
      "7": "p7",
      "8": "p8",
      一: "p1",
      二: "p2",
      三: "p3",
      四: "p4",
      五: "p5",
      六: "p6",
      七: "p7",
      八: "p8",
    };
    return map[m[1]];
  }
  if (t.includes("自主")) return "p9";
  return undefined;
}

function sheetToMatrix(sheet: XLSX.WorkSheet): string[][] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  return rows.map((row) => (Array.isArray(row) ? row.map(norm) : []));
}

function findGrid(matrix: string[][]) {
  let headerRow = -1;
  const dayCols: { col: number; day: DayId }[] = [];
  for (let r = 0; r < Math.min(matrix.length, 12); r++) {
    const found: { col: number; day: DayId }[] = [];
    for (let c = 0; c < (matrix[r]?.length ?? 0); c++) {
      const day = detectDay(matrix[r][c]);
      if (day) found.push({ col: c, day });
    }
    if (found.length >= 3) {
      headerRow = r;
      dayCols.push(...found);
      break;
    }
  }
  if (headerRow < 0) return null;

  const periodRows: { row: number; periodId: string }[] = [];
  for (let r = headerRow + 1; r < matrix.length; r++) {
    const first = matrix[r]?.[0] ?? "";
    const second = matrix[r]?.[1] ?? "";
    const period = detectPeriod(first) ?? detectPeriod(second);
    if (period) periodRows.push({ row: r, periodId: period });
  }
  if (periodRows.length < 4) return null;
  return { headerRow, dayCols, periodRows };
}

type CellBits = {
  subject?: string;
  teacherCodes: string[];
  classNames: string[];
  room?: string;
};

function parseCell(text: string, seed: ScheduleData): CellBits {
  const raw = text.replace(/[|／/]/g, "\n");
  const lines = raw
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const teacherCodes: string[] = [];
  const classNames: string[] = [];
  let subject: string | undefined;
  let room: string | undefined;

  const teacherByCode = new Map(seed.teachers.map((t) => [t.code, t]));
  const teacherByName = new Map(seed.teachers.map((t) => [t.name, t]));
  const classSet = new Set(seed.classes.map((c) => c.name));
  const roomByName = new Map(seed.rooms.map((r) => [r.name, r]));
  const roomById = new Map(seed.rooms.map((r) => [r.id, r]));

  for (const line of lines) {
    const compact = line.replace(/\s/g, "");
    if (classSet.has(compact) || /^[1-6][A-E]$/i.test(compact)) {
      classNames.push(compact.toUpperCase());
      continue;
    }
    if (teacherByCode.has(compact) || teacherByName.has(compact)) {
      const t = teacherByCode.get(compact) ?? teacherByName.get(compact);
      if (t) teacherCodes.push(t.code);
      continue;
    }
    if (roomByName.has(line) || roomById.has(compact) || /室|館|堂|房/.test(line)) {
      room = roomByName.get(line)?.id ?? compact;
      continue;
    }
    if (ABBR_TO_SUBJECT[compact]) {
      subject = ABBR_TO_SUBJECT[compact];
      continue;
    }
    if (SUBJECT_ABBR[compact] || SUBJECT_ABBR[line]) {
      subject = line;
      continue;
    }
    const knownSub = Object.keys(SUBJECT_ABBR).find(
      (s) => compact.includes(s) || s.includes(compact),
    );
    if (knownSub) {
      subject = knownSub;
      const rest = compact.replace(knownSub, "");
      if (teacherByCode.has(rest)) teacherCodes.push(rest);
      continue;
    }
    for (const t of seed.teachers) {
      if (compact.endsWith(t.code) && compact.length <= t.code.length + 4) {
        subject = compact.slice(0, compact.length - t.code.length) || subject;
        teacherCodes.push(t.code);
        if (subject && ABBR_TO_SUBJECT[subject]) subject = ABBR_TO_SUBJECT[subject];
        break;
      }
    }
  }

  if (!subject && lines[0]) subject = lines[0];
  return { subject, teacherCodes, classNames, room };
}

function guessKind(filename: string, sheetName: string): "class" | "teacher" | "room" | "matrix" {
  const t = `${filename} ${sheetName}`;
  if (/特別室|房間|room/i.test(t)) return "room";
  if (/老師總表|教師|teacher/i.test(t)) return "teacher";
  if (/配課/.test(t)) return "matrix";
  if (/班級|班別|class/i.test(t)) return "class";
  return "class";
}

function sheetEntity(sheetName: string, matrix: string[][], seed: ScheduleData) {
  const joined = matrix
    .slice(0, 6)
    .flat()
    .join(" ");
  const classHit = seed.classes.find(
    (c) => sheetName.toUpperCase() === c.name || new RegExp(`\\b${c.name}\\b`).test(joined),
  );
  const teacherHit = seed.teachers.find(
    (t) =>
      sheetName === t.code ||
      sheetName.includes(t.name) ||
      joined.includes(`老師：${t.name}`) ||
      joined.includes(`教師：${t.name}`) ||
      joined.includes(t.name),
  );
  const roomHit = seed.rooms.find(
    (r) => sheetName === r.name || sheetName === r.id || joined.includes(r.name),
  );
  return { classHit, teacherHit, roomHit };
}

export function parseWorkbook(
  buffer: ArrayBuffer | Buffer,
  filename: string,
  seed: ScheduleData,
  acc: ScheduleData,
  warnings: string[],
) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  for (const sheetName of wb.SheetNames) {
    const matrix = sheetToMatrix(wb.Sheets[sheetName]);
    if (matrix.length < 4) continue;
    const kind = guessKind(filename, sheetName);
    const grid = findGrid(matrix);
    if (!grid) {
      parseMatrixSheet(matrix, seed, acc, warnings, sheetName);
      continue;
    }
    const entity = sheetEntity(sheetName, matrix, seed);

    for (const pr of grid.periodRows) {
      for (const dc of grid.dayCols) {
        const cell = matrix[pr.row]?.[dc.col] ?? "";
        if (!cell || cell === "-" || cell === "／" || cell === "/") continue;
        const bits = parseCell(cell, seed);
        if (!bits.subject && bits.teacherCodes.length === 0 && bits.classNames.length === 0) {
          continue;
        }

        let classIds = bits.classNames;
        let teacherIds = bits.teacherCodes;
        let roomId = bits.room;

        if (kind === "class" && entity.classHit) classIds = [entity.classHit.id];
        if (kind === "teacher" && entity.teacherHit) {
          teacherIds = teacherIds.length ? teacherIds : [entity.teacherHit.id];
        }
        if (kind === "room" && entity.roomHit) roomId = entity.roomHit.id;

        if (classIds.length === 0 && entity.classHit) classIds = [entity.classHit.id];
        if (teacherIds.length === 0 && entity.teacherHit) teacherIds = [entity.teacherHit.id];

        if (classIds.length === 0 || teacherIds.length === 0) {
          warnings.push(`${filename}／${sheetName} ${dc.day}${pr.periodId}：未能完整辨識「${cell}」`);
          continue;
        }

        const cls = acc.classes.find((c) => c.id === classIds[0] || c.name === classIds[0]);
        if (!roomId) roomId = cls?.homeRoom ?? "hall";

        upsertLesson(acc, {
          day: dc.day,
          periodId: pr.periodId,
          classIds: classIds.map((id) => id.toUpperCase()),
          teacherIds,
          subject: bits.subject ?? "課堂",
          roomId,
        });
      }
    }
  }
}

function parseMatrixSheet(
  matrix: string[][],
  seed: ScheduleData,
  acc: ScheduleData,
  warnings: string[],
  sheetName: string,
) {
  let headerRow = -1;
  const colMap: { col: number; day: DayId; periodId: string }[] = [];
  for (let r = 0; r < Math.min(8, matrix.length); r++) {
    const cols: { col: number; day: DayId; periodId: string }[] = [];
    for (let c = 1; c < (matrix[r]?.length ?? 0); c++) {
      const t = matrix[r][c].replace(/\s/g, "");
      const day = detectDay(t);
      const period = detectPeriod(t);
      if (day && period) cols.push({ col: c, day, periodId: period });
      else if (day && !period) {
        const next = matrix[r + 1]?.[c] ?? "";
        const p = detectPeriod(next);
        if (p) cols.push({ col: c, day, periodId: p });
      }
    }
    if (cols.length >= 8) {
      headerRow = r;
      colMap.push(...cols);
      break;
    }
  }
  if (headerRow < 0) return;

  for (let r = headerRow + 1; r < matrix.length; r++) {
    const name = (matrix[r][0] || matrix[r][1] || "").replace(/\s/g, "").toUpperCase();
    if (!/^[1-6][A-E]$/.test(name)) continue;
    for (const col of colMap) {
      const cell = matrix[r][col.col];
      if (!cell) continue;
      const bits = parseCell(cell, seed);
      const teacherIds = bits.teacherCodes;
      if (!teacherIds.length) {
        warnings.push(`${sheetName} ${name} ${col.day}${col.periodId}：無老師代碼`);
        continue;
      }
      const cls = acc.classes.find((c) => c.id === name);
      upsertLesson(acc, {
        day: col.day,
        periodId: col.periodId,
        classIds: [name],
        teacherIds,
        subject: bits.subject ?? "課堂",
        roomId: bits.room ?? cls?.homeRoom ?? "hall",
      });
    }
  }
}

function upsertLesson(
  acc: ScheduleData,
  input: Omit<Lesson, "id">,
) {
  const existing = acc.lessons.find(
    (l) =>
      l.day === input.day &&
      l.periodId === input.periodId &&
      l.classIds[0] === input.classIds[0] &&
      l.teacherIds.join() === input.teacherIds.join(),
  );
  if (existing) {
    existing.subject = input.subject;
    existing.roomId = input.roomId;
    return;
  }
  acc.lessons.push({
    id: `I${acc.lessons.length + 1}`,
    ...input,
  });
}

export function emptyFromSeed(seed: ScheduleData): ScheduleData {
  return {
    meta: {
      ...seed.meta,
      source: "excel-import",
      updatedAt: new Date().toISOString(),
    },
    teachers: seed.teachers,
    classes: seed.classes,
    rooms: seed.rooms,
    lessons: [],
  };
}

export function importExcels(
  files: { name: string; buffer: Buffer }[],
): { data: ScheduleData; report: ImportReport } {
  const seed = generateSeed();
  const acc = emptyFromSeed(seed);
  const warnings: string[] = [];
  const sheets: string[] = [];

  for (const file of files) {
    const wb = XLSX.read(file.buffer, { type: "buffer" });
    sheets.push(...wb.SheetNames.map((s) => `${file.name}:${s}`));
    parseWorkbook(file.buffer, file.name, seed, acc, warnings);
  }

  if (acc.lessons.length === 0) {
    warnings.push("未能從 Excel 辨識課堂。已保留種子課表，請檢查檔案是否為班別／老師／特別室總表格式。");
    return {
      data: {
        ...seed,
        meta: { ...seed.meta, source: "seed-fallback", updatedAt: new Date().toISOString() },
      },
      report: {
        files: files.map((f) => f.name),
        sheets,
        lessons: seed.lessons.length,
        teachers: seed.teachers.length,
        classes: seed.classes.length,
        rooms: seed.rooms.length,
        warnings,
      },
    };
  }

  return {
    data: acc,
    report: {
      files: files.map((f) => f.name),
      sheets,
      lessons: acc.lessons.length,
      teachers: acc.teachers.length,
      classes: acc.classes.length,
      rooms: acc.rooms.length,
      warnings: warnings.slice(0, 40),
    },
  };
}

export function buildSampleWorkbooks(data: ScheduleData) {
  const classWb = XLSX.utils.book_new();
  const teacherWb = XLSX.utils.book_new();
  const roomWb = XLSX.utils.book_new();
  const assignWb = XLSX.utils.book_new();

  const dayHeaders = DAYS.map((d) => d.label);
  const periodLabels = ["第一節", "第二節", "第三節", "第四節", "第五節", "第六節", "第七節", "第八節", "自主學習"];
  const periodIds = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"];

  function gridFor(
    rows: string[][],
    lookup: (day: DayId, periodId: string) => string,
  ) {
    rows.push(["", ...dayHeaders]);
    periodIds.forEach((pid, i) => {
      const line = [periodLabels[i]];
      for (const d of DAYS) {
        if (pid === "p9" && d.id === "fri") {
          line.push("");
          continue;
        }
        line.push(lookup(d.id, pid));
      }
      rows.push(line);
    });
  }

  for (const cls of data.classes) {
    const rows: string[][] = [[`班別：${cls.name}`], [`班主任：${cls.classTeacherIds.join("／")}`], [`課室：${cls.homeRoom}室`]];
    gridFor(rows, (day, periodId) => {
      const l = data.lessons.find(
        (x) => x.day === day && x.periodId === periodId && x.classIds.includes(cls.id),
      );
      if (!l) return "";
      const teachers = l.teacherIds
        .map((id) => data.teachers.find((t) => t.id === id)?.code ?? id)
        .join("/");
      const room = data.rooms.find((r) => r.id === l.roomId)?.name ?? l.roomId;
      return `${l.subject}\n${teachers}\n${room}`;
    });
    XLSX.utils.book_append_sheet(classWb, XLSX.utils.aoa_to_sheet(rows), cls.name);
  }

  for (const t of data.teachers) {
    const rows: string[][] = [[`老師：${t.name}`], [`簡稱：${t.code}`], [`科目：${t.subjects.join("、")}`]];
    gridFor(rows, (day, periodId) => {
      const l = data.lessons.find(
        (x) => x.day === day && x.periodId === periodId && x.teacherIds.includes(t.id),
      );
      if (!l) return "";
      const room = data.rooms.find((r) => r.id === l.roomId)?.name ?? l.roomId;
      return `${l.classIds.join("/")}\n${l.subject}\n${room}`;
    });
    const sheetName = `${t.code}-${t.name}`.slice(0, 31);
    XLSX.utils.book_append_sheet(teacherWb, XLSX.utils.aoa_to_sheet(rows), sheetName);
  }

  for (const room of data.rooms.filter((r) => r.kind === "special")) {
    const rows: string[][] = [[`特別室：${room.name}`]];
    gridFor(rows, (day, periodId) => {
      const l = data.lessons.find(
        (x) => x.day === day && x.periodId === periodId && x.roomId === room.id,
      );
      if (!l) return "";
      const teachers = l.teacherIds
        .map((id) => data.teachers.find((t) => t.id === id)?.code ?? id)
        .join("/");
      return `${l.classIds.join("/")}\n${l.subject}\n${teachers}`;
    });
    XLSX.utils.book_append_sheet(roomWb, XLSX.utils.aoa_to_sheet(rows), room.name.slice(0, 31));
  }

  const assignRows: string[][] = [];
  const header = ["班別"];
  for (const d of DAYS) {
    for (const label of periodLabels) {
      if (label === "自主學習" && d.id === "fri") continue;
      header.push(`${d.short}${label.replace("第", "").replace("節", "")}`);
    }
  }
  assignRows.push(header);
  for (const cls of data.classes) {
    const row = [cls.name];
    for (const d of DAYS) {
      for (const pid of periodIds) {
        if (pid === "p9" && d.id === "fri") continue;
        const l = data.lessons.find(
          (x) => x.day === d.id && x.periodId === pid && x.classIds.includes(cls.id),
        );
        if (!l) {
          row.push("");
          continue;
        }
        const abbr = SUBJECT_ABBR[l.subject] ?? l.subject;
        const code = l.teacherIds[0] ?? "";
        row.push(`${abbr}${code}`);
      }
    }
    assignRows.push(row);
  }
  XLSX.utils.book_append_sheet(assignWb, XLSX.utils.aoa_to_sheet(assignRows), "配課總表");

  return {
    classBook: XLSX.write(classWb, { type: "buffer", bookType: "xlsx" }) as Buffer,
    teacherBook: XLSX.write(teacherWb, { type: "buffer", bookType: "xlsx" }) as Buffer,
    roomBook: XLSX.write(roomWb, { type: "buffer", bookType: "xlsx" }) as Buffer,
    assignBook: XLSX.write(assignWb, { type: "buffer", bookType: "xlsx" }) as Buffer,
  };
}
