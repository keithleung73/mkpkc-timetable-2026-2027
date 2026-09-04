import { NextResponse } from "next/server";
import {
  applyBalances,
  generateCoverPlan,
  type CoverAssignment,
  type CoverPlan,
  undoBalances,
  validateCoverPlan,
  weekdayFromIsoDate,
} from "@/lib/cover";
import { coverDateError } from "@/lib/school-calendar";
import { readCoverStore, writeCoverStore } from "@/lib/cover-store";
import { readSchedule } from "@/lib/store";
import { applyConfirmedSwaps } from "@/lib/swap-records";
import { readSwapStore } from "@/lib/swap-store";

export async function GET() {
  const store = readCoverStore();
  const swaps = readSwapStore().swaps;
  return NextResponse.json({ ...store, swaps });
}

type Body = {
  action?: string;
  date?: string;
  absenteeIds?: string[];
  plan?: CoverPlan;
  planId?: string;
  assignments?: CoverAssignment[];
  teacherId?: string;
  delta?: number;
};

function scheduleForDate(date: string) {
  return applyConfirmedSwaps(readSchedule(), date, readSwapStore().swaps);
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "請求格式不正確" }, { status: 400 });
  }

  const action = body.action;
  const store = readCoverStore();

  if (action === "preview") {
    const date = body.date ?? "";
    const closed = coverDateError(date);
    if (closed) {
      return NextResponse.json({ error: closed }, { status: 400 });
    }
    const day = weekdayFromIsoDate(date);
    if (!day) {
      return NextResponse.json({ error: "請揀上課日（星期一至五）" }, { status: 400 });
    }
    const absentees = body.absenteeIds ?? [];
    if (absentees.length === 0) {
      return NextResponse.json({ error: "請先勾選請假同事" }, { status: 400 });
    }
    const data = scheduleForDate(date);
    const plan = generateCoverPlan(data, day, date, absentees, store.balances, store.plans);
    return NextResponse.json({ plan, balances: store.balances, swaps: readSwapStore().swaps });
  }

  if (action === "adjustBalance") {
    const teacherId = body.teacherId?.trim();
    const delta = body.delta;
    if (!teacherId) return NextResponse.json({ error: "請選擇老師" }, { status: 400 });
    if (delta !== 1 && delta !== -1) {
      return NextResponse.json({ error: "結餘只可以 ±1" }, { status: 400 });
    }
    const data = readSchedule();
    if (!data.teachers.some((t) => t.id === teacherId)) {
      return NextResponse.json({ error: "搵唔到呢位老師" }, { status: 404 });
    }
    const balances = { ...store.balances, [teacherId]: (store.balances[teacherId] ?? 0) + delta };
    const next = { ...store, balances };
    writeCoverStore(next);
    return NextResponse.json({
      ok: true,
      balances: next.balances,
      plans: next.plans,
      swaps: readSwapStore().swaps,
    });
  }

  if (action === "confirm") {
    const incoming = body.plan;
    if (!incoming) {
      return NextResponse.json({ error: "未有代堂方案" }, { status: 400 });
    }
    const closed = coverDateError(incoming.date);
    if (closed) {
      return NextResponse.json({ error: closed }, { status: 400 });
    }
    const data = scheduleForDate(incoming.date);
    const error = validateCoverPlan(data, incoming, store.balances);
    if (error) return NextResponse.json({ error }, { status: 400 });

    let balances = { ...store.balances };
    const remaining = store.plans.filter((p) => p.date !== incoming.date);
    for (const old of store.plans.filter((p) => p.date === incoming.date)) {
      balances = undoBalances(balances, old);
    }
    balances = applyBalances(balances, incoming);
    const saved = {
      ...incoming,
      id: `cover-${incoming.date}-${Date.now()}`,
      confirmedAt: new Date().toISOString(),
    };
    const next = { balances, plans: [saved, ...remaining].slice(0, 80) };
    writeCoverStore(next);
    return NextResponse.json({
      ok: true,
      saved,
      balances: next.balances,
      plans: next.plans,
      swaps: readSwapStore().swaps,
    });
  }

  if (action === "undo") {
    const planId = body.planId;
    const found = store.plans.find((p) => p.id === planId);
    if (!found) {
      return NextResponse.json({ error: "找不到要撤銷嘅方案" }, { status: 404 });
    }
    const next = {
      balances: undoBalances(store.balances, found),
      plans: store.plans.filter((p) => p.id !== planId),
    };
    writeCoverStore(next);
    return NextResponse.json({
      ok: true,
      balances: next.balances,
      plans: next.plans,
      swaps: readSwapStore().swaps,
    });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
