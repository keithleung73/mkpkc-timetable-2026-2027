import { NextResponse } from "next/server";
import { planTeacherLeaveSwaps } from "@/lib/swap";
import { weekdayFromIsoDate } from "@/lib/cover";
import { readSchedule } from "@/lib/store";

type Body = {
  teacherId?: string;
  leaveDates?: string[];
  swapFromDate?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "請求格式不正確" }, { status: 400 });
  }

  const teacherId = body.teacherId?.trim();
  const leaveDates = [...new Set((body.leaveDates ?? []).filter(Boolean))].sort();
  const swapFromDate = body.swapFromDate?.trim() ?? "";

  if (!teacherId) {
    return NextResponse.json({ error: "請選擇請假老師" }, { status: 400 });
  }
  if (leaveDates.length === 0) {
    return NextResponse.json({ error: "請選擇至少一日事假／公假日期" }, { status: 400 });
  }
  if (!swapFromDate || !weekdayFromIsoDate(swapFromDate)) {
    return NextResponse.json({ error: "請選擇上課日作為調堂開始日（星期一至五）" }, { status: 400 });
  }
  if (leaveDates.some((d) => !weekdayFromIsoDate(d))) {
    return NextResponse.json({ error: "請假日期只能係星期一至五" }, { status: 400 });
  }

  const data = readSchedule();
  if (!data.teachers.some((t) => t.id === teacherId)) {
    return NextResponse.json({ error: "搵唔到呢位老師" }, { status: 404 });
  }

  const plan = planTeacherLeaveSwaps(data, teacherId, leaveDates, swapFromDate);
  return NextResponse.json({ plan });
}
