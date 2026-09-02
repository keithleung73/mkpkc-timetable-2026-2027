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
import { readCoverStore, writeCoverStore } from "@/lib/cover-store";
import { readSchedule } from "@/lib/store";

export async function GET() {
  const store = readCoverStore();
  return NextResponse.json(store);
}

type Body = {
  action?: string;
  date?: string;
  absenteeIds?: string[];
  plan?: CoverPlan;
  planId?: string;
  assignments?: CoverAssignment[];
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "請求格式不正確" }, { status: 400 });
  }

  const action = body.action;
  const data = readSchedule();
  const store = readCoverStore();

  if (action === "preview") {
    const date = body.date ?? "";
    const day = weekdayFromIsoDate(date);
    if (!day) {
      return NextResponse.json({ error: "請揀上課日（星期一至五）" }, { status: 400 });
    }
    const absentees = body.absenteeIds ?? [];
    if (absentees.length === 0) {
      return NextResponse.json({ error: "請先勾選請假同事" }, { status: 400 });
    }
    const plan = generateCoverPlan(data, day, date, absentees, store.balances, store.plans);
    return NextResponse.json({ plan, balances: store.balances });
  }

  if (action === "confirm") {
    const incoming = body.plan;
    if (!incoming) {
      return NextResponse.json({ error: "未有代堂方案" }, { status: 400 });
    }
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
    return NextResponse.json({ ok: true, saved, balances: next.balances, plans: next.plans });
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
    return NextResponse.json({ ok: true, balances: next.balances, plans: next.plans });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
