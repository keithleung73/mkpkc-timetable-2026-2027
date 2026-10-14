import { NextResponse } from "next/server";
import {
  isArrangementWorkbook,
  mergeArrangementImport,
  parseArrangementWorkbook,
  resolveArrangements,
  type ArrangementImport,
} from "@/lib/arrangement-import";
import { readCoverStore, writeCoverStore } from "@/lib/cover-store";
import { readSchedule } from "@/lib/store";
import type { SavedSwapRecord } from "@/lib/swap-records";
import { readSwapStore, writeSwapStore } from "@/lib/swap-store";
import type { SavedCoverPlan } from "@/lib/cover";

export const runtime = "nodejs";

function payload() {
  const cover = readCoverStore();
  const swaps = readSwapStore();
  return { balances: cover.balances, plans: cover.plans, swaps: swaps.swaps };
}

export async function GET() {
  return NextResponse.json(payload());
}

function isPlan(value: unknown): value is SavedCoverPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as SavedCoverPlan;
  return typeof plan.date === "string" && typeof plan.day === "string" && Array.isArray(plan.assignments) && Array.isArray(plan.slots);
}

function isSwap(value: unknown): value is SavedSwapRecord {
  if (!value || typeof value !== "object") return false;
  const swap = value as SavedSwapRecord;
  return typeof swap.leaveDate === "string" && typeof swap.leaveTeacherId === "string" && typeof swap.partnerTeacherId === "string";
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "請選擇調堂代堂 Excel" }, { status: 400 });
    }
    const parsed = parseArrangementWorkbook(Buffer.from(await file.arrayBuffer()), { source: file.name });
    if (!isArrangementWorkbook(parsed)) {
      return NextResponse.json({ error: "呢個檔唔似學務部《通知各部門調堂代堂安排》" }, { status: 400 });
    }
    const incoming = resolveArrangements(readSchedule(), parsed);
    if (incoming.plans.length === 0 && incoming.swaps.length === 0) {
      return NextResponse.json({ error: "檔案沒有可上存嘅調堂或代堂", warnings: incoming.warnings }, { status: 400 });
    }
    return NextResponse.json({ ok: true, preview: incoming });
  }

  let body: { action?: string; plans?: unknown; swaps?: unknown; date?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "請求格式不正確" }, { status: 400 });
  }

  if (body.action === "save") {
    const plans = Array.isArray(body.plans) ? body.plans.filter(isPlan) : [];
    const swaps = Array.isArray(body.swaps) ? body.swaps.filter(isSwap) : [];
    if (plans.length === 0 && swaps.length === 0) {
      return NextResponse.json({ error: "沒有可上存嘅紀錄" }, { status: 400 });
    }
    const incoming: ArrangementImport = {
      plans,
      swaps,
      warnings: [],
      summary: {
        dates: [],
        coverCount: plans.reduce((n, p) => n + p.assignments.filter((a) => !a.reason.startsWith("合班")).length, 0),
        combineCount: plans.reduce((n, p) => n + p.assignments.filter((a) => a.reason.startsWith("合班")).length, 0),
        swapCount: swaps.length,
        leftoverCount: plans.reduce((n, p) => n + p.leftover.length, 0),
        unmatchedTeachers: [],
      },
    };
    const cover = readCoverStore();
    const existing = readSwapStore();
    const merged = mergeArrangementImport(cover, existing.swaps, incoming);
    writeCoverStore({ balances: merged.balances, plans: merged.plans });
    writeSwapStore({ swaps: merged.swaps });
    return NextResponse.json({
      ok: true,
      balances: merged.balances,
      plans: merged.plans,
      swaps: merged.swaps,
      summary: incoming.summary,
    });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
