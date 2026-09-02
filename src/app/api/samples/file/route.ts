import { NextResponse } from "next/server";
import { buildSampleWorkbooks } from "@/lib/excel";
import { readSchedule } from "@/lib/store";

const FILES: Record<string, { name: string; key: keyof ReturnType<typeof buildSampleWorkbooks> }> = {
  class: { name: "1.0 (2026-2027) 班級總表.xlsx", key: "classBook" },
  teacher: { name: "2.0 (2026-2027) 老師總表.xlsx", key: "teacherBook" },
  room: { name: "3.0 (2026-2027) 特別室總表.xlsx", key: "roomBook" },
  assign: { name: "2026-2027_各班配課總表.xlsx", key: "assignBook" },
};

export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind") ?? "class";
  const spec = FILES[kind];
  if (!spec) return NextResponse.json({ error: "unknown kind" }, { status: 400 });
  const books = buildSampleWorkbooks(readSchedule());
  const buf = books[spec.key];
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(spec.name)}`,
    },
  });
}
