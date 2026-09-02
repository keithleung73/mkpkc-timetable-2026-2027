import { NextResponse } from "next/server";
import { buildSampleWorkbooks } from "@/lib/excel";
import { readSchedule } from "@/lib/store";

export async function GET() {
  const data = readSchedule();
  const books = buildSampleWorkbooks(data);
  return NextResponse.json({
    files: [
      { name: "1.0 (2026-2027) 班級總表.xlsx", bytes: books.classBook.length },
      { name: "2.0 (2026-2027) 老師總表.xlsx", bytes: books.teacherBook.length },
      { name: "3.0 (2026-2027) 特別室總表.xlsx", bytes: books.roomBook.length },
      { name: "2026-2027_各班配課總表.xlsx", bytes: books.assignBook.length },
    ],
  });
}
