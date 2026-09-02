import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { importExcels } from "@/lib/excel";
import { buildOfficialSchedule } from "@/lib/parse-teacher-timetable";
import { writeSchedule } from "@/lib/store";

export const runtime = "nodejs";

function isTeacherTimetable(buffer: Buffer): boolean {
  const wb = XLSX.read(buffer, { type: "buffer" });
  return (
    wb.SheetNames.length >= 40 &&
    wb.SheetNames.some((n) => /\(ENG\)/i.test(n) || n === "華" || n === "真" || n === "鵠")
  );
}

function isAssignment(buffer: Buffer, name: string): boolean {
  if (/配課|555666/i.test(name)) return true;
  const wb = XLSX.read(buffer, { type: "buffer" });
  if (wb.SheetNames.length !== 1) return false;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    raw: false,
    defval: "",
  });
  const header = (rows[0] || []).map((x) => String(x)).join(" ");
  return header.includes("簡稱") && header.includes("任教科目");
}

export async function POST(req: Request) {
  const form = await req.formData();
  const files: { name: string; buffer: Buffer }[] = [];
  for (const value of form.values()) {
    if (value instanceof File) {
      files.push({ name: value.name, buffer: Buffer.from(await value.arrayBuffer()) });
    }
  }
  if (files.length === 0) {
    return NextResponse.json({ error: "請選擇 Excel 檔案" }, { status: 400 });
  }

  const tt = files.find((f) => isTeacherTimetable(f.buffer));
  const assign = files.find((f) => isAssignment(f.buffer, f.name));
  if (tt) {
    const data = buildOfficialSchedule(tt.buffer, assign?.buffer);
    writeSchedule(data);
    return NextResponse.json({
      ok: true,
      report: {
        files: files.map((f) => f.name),
        sheets: [`教師時間表 ${data.teachers.length} 位老師`],
        lessons: data.lessons.length,
        teachers: data.teachers.length,
        classes: data.classes.length,
        rooms: data.rooms.length,
        warnings: [],
      },
      meta: data.meta,
      lessons: data.lessons.length,
    });
  }

  const { data, report } = importExcels(files);
  writeSchedule(data);
  return NextResponse.json({ ok: true, report, meta: data.meta, lessons: data.lessons.length });
}
