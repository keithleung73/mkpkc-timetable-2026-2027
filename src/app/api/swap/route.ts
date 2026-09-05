import { NextResponse } from "next/server";
import { weekdayFromIsoDate } from "@/lib/cover";
import type { LeaveKind } from "@/lib/leave";
import { readSchedule } from "@/lib/store";
import { planTeacherLeaveSwaps } from "@/lib/swap";
import {
  confirmedSwapFromSuggestion,
  confirmedSwapManual,
  reviseConfirmedSwap,
  swapConflicts,
  type ConfirmedSwap,
} from "@/lib/swap-records";
import { addConfirmedSwap, readSwapStore, removeConfirmedSwap, writeConfirmedSwaps } from "@/lib/swap-store";

export async function GET() {
  return NextResponse.json(readSwapStore());
}

type Body = {
  action?: string;
  teacherId?: string;
  leaveDates?: string[];
  swapFromDate?: string;
  record?: ConfirmedSwap;
  swapId?: string;
  leaveTeacherId?: string;
  leaveDate?: string;
  leavePeriodId?: string;
  partnerDate?: string;
  partnerPeriodId?: string;
  partnerTeacherId?: string;
  leaveLessonIds?: string[];
  partnerLessonIds?: string[];
  partnerDay?: string;
  reason?: string;
  leaveKind?: LeaveKind;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "請求格式不正確" }, { status: 400 });
  }

  const data = readSchedule();
  const action = body.action ?? "plan";

  if (action === "plan" || !body.action) {
    const teacherId = body.teacherId?.trim();
    const leaveDates = [...new Set((body.leaveDates ?? []).filter(Boolean))].sort();
    const swapFromDate = body.swapFromDate?.trim() ?? "";

    if (!teacherId) {
      return NextResponse.json({ error: "請選擇請假老師" }, { status: 400 });
    }
    if (leaveDates.length === 0) {
      return NextResponse.json({ error: "請選擇至少一日病假／事假／公假日期" }, { status: 400 });
    }
    if (!swapFromDate || !weekdayFromIsoDate(swapFromDate)) {
      return NextResponse.json({ error: "請選擇上課日作為調堂開始日（星期一至五）" }, { status: 400 });
    }
    if (leaveDates.some((d) => !weekdayFromIsoDate(d))) {
      return NextResponse.json({ error: "請假日期只能係星期一至五" }, { status: 400 });
    }
    if (!data.teachers.some((t) => t.id === teacherId)) {
      return NextResponse.json({ error: "搵唔到呢位老師" }, { status: 404 });
    }

    const plan = planTeacherLeaveSwaps(data, teacherId, leaveDates, swapFromDate);
    return NextResponse.json({ plan, swaps: readSwapStore().swaps });
  }

  if (action === "confirm") {
    const incoming = body.record;
    let record: ConfirmedSwap | { error: string } | null = incoming ?? null;
    if (!record && body.leaveTeacherId && body.leaveDate && body.leavePeriodId && body.partnerDate) {
      const leaveLessons = data.lessons.filter((l) => (body.leaveLessonIds ?? []).includes(l.id));
      const partnerLessons = data.lessons.filter((l) => (body.partnerLessonIds ?? []).includes(l.id));
      const partnerDay = weekdayFromIsoDate(body.partnerDate);
      if (!partnerDay) return NextResponse.json({ error: "調往日期唔係上課日" }, { status: 400 });
      record = confirmedSwapFromSuggestion(
        data,
        body.leaveTeacherId,
        body.leaveDate,
        body.leavePeriodId,
        leaveLessons,
        body.partnerDate,
        partnerDay,
        body.partnerPeriodId ?? "",
        partnerLessons,
        body.reason ?? "確認調堂",
        body.leaveKind,
      );
    }
    if (!record) return NextResponse.json({ error: "未有調堂紀錄" }, { status: 400 });
    if ("error" in record) return NextResponse.json({ error: record.error }, { status: 400 });

    const store = readSwapStore();
    const conflict = swapConflicts(store.swaps, record);
    if (conflict) return NextResponse.json({ error: conflict }, { status: 400 });
    const next = addConfirmedSwap(record);
    return NextResponse.json({ ok: true, saved: record, swaps: next.swaps });
  }

  if (action === "add") {
    if (!body.leaveTeacherId || !body.leaveDate || !body.leavePeriodId || !body.partnerDate || !body.partnerPeriodId) {
      return NextResponse.json({ error: "請填原課堂同調往日期／節次" }, { status: 400 });
    }
    const record = confirmedSwapManual(data, {
      leaveTeacherId: body.leaveTeacherId,
      leaveDate: body.leaveDate,
      leavePeriodId: body.leavePeriodId,
      partnerDate: body.partnerDate,
      partnerPeriodId: body.partnerPeriodId,
      partnerTeacherId: body.partnerTeacherId || undefined,
      leaveKind: body.leaveKind,
    });
    if ("error" in record) return NextResponse.json({ error: record.error }, { status: 400 });
    const conflict = swapConflicts(readSwapStore().swaps, record);
    if (conflict) return NextResponse.json({ error: conflict }, { status: 400 });
    const next = addConfirmedSwap(record);
    return NextResponse.json({ ok: true, saved: record, swaps: next.swaps });
  }

  if (action === "update") {
    const swapId = body.swapId;
    if (!swapId) return NextResponse.json({ error: "未指定要修改嘅紀錄" }, { status: 400 });
    if (!body.leaveTeacherId || !body.leaveDate || !body.leavePeriodId || !body.partnerDate || !body.partnerPeriodId) {
      return NextResponse.json({ error: "請填原課堂同調往日期／節次" }, { status: 400 });
    }
    const revised = reviseConfirmedSwap(data, readSwapStore().swaps, swapId, {
      leaveTeacherId: body.leaveTeacherId,
      leaveDate: body.leaveDate,
      leavePeriodId: body.leavePeriodId,
      partnerDate: body.partnerDate,
      partnerPeriodId: body.partnerPeriodId,
      partnerTeacherId: body.partnerTeacherId || undefined,
      leaveKind: body.leaveKind,
    });
    if ("error" in revised) return NextResponse.json({ error: revised.error }, { status: 400 });
    writeConfirmedSwaps(revised.swaps);
    return NextResponse.json({ ok: true, saved: revised.saved, swaps: revised.swaps });
  }

  if (action === "undo") {
    const swapId = body.swapId;
    if (!swapId) return NextResponse.json({ error: "未指定要刪除嘅紀錄" }, { status: 400 });
    const { store, removed } = removeConfirmedSwap(swapId);
    if (!removed) return NextResponse.json({ error: "找不到要撤銷嘅調堂紀錄" }, { status: 404 });
    return NextResponse.json({ ok: true, swaps: store.swaps });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
