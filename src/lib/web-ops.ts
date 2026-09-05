import {
  applyBalances,
  generateCoverPlan,
  undoBalances,
  validateCoverPlan,
  weekdayFromIsoDate,
  type CoverAssignment,
  type CoverPlan,
} from "./cover";
import {
  loadCoverStore,
  loadSwapStore,
  saveCoverStore,
  saveSwapStore,
} from "./browser-records";
import { isStaticExport } from "./runtime";
import { coverDateError } from "./school-calendar";
import { planTeacherLeaveSwaps } from "./swap";
import {
  applyConfirmedSwaps,
  confirmedSwapFromSuggestion,
  confirmedSwapManual,
  reviseConfirmedSwap,
  swapConflicts,
  type ConfirmedSwap,
} from "./swap-records";
import type { ScheduleData } from "./types";

export type SwapBody = {
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
};

export type CoverBody = {
  action?: string;
  date?: string;
  absenteeIds?: string[];
  plan?: CoverPlan;
  planId?: string;
  assignments?: CoverAssignment[];
  teacherId?: string;
  delta?: number;
};

type Err = { error: string };

function fail(error: string): Err {
  return { error };
}

export function localSwapGet() {
  return loadSwapStore();
}

export function localSwapPost(data: ScheduleData, body: SwapBody) {
  const action = body.action ?? "plan";

  if (action === "plan" || !body.action) {
    const teacherId = body.teacherId?.trim();
    const leaveDates = [...new Set((body.leaveDates ?? []).filter(Boolean))].sort();
    const swapFromDate = body.swapFromDate?.trim() ?? "";
    if (!teacherId) return fail("請選擇請假老師");
    if (leaveDates.length === 0) return fail("請選擇至少一日事假／公假日期");
    if (!swapFromDate || !weekdayFromIsoDate(swapFromDate)) {
      return fail("請選擇上課日作為調堂開始日（星期一至五）");
    }
    if (leaveDates.some((d) => !weekdayFromIsoDate(d))) {
      return fail("請假日期只能係星期一至五");
    }
    if (!data.teachers.some((t) => t.id === teacherId)) return fail("搵唔到呢位老師");
    const plan = planTeacherLeaveSwaps(data, teacherId, leaveDates, swapFromDate);
    return { plan, swaps: loadSwapStore().swaps };
  }

  if (action === "confirm") {
    const incoming = body.record;
    let record: ConfirmedSwap | { error: string } | null = incoming ?? null;
    if (!record && body.leaveTeacherId && body.leaveDate && body.leavePeriodId && body.partnerDate) {
      const leaveLessons = data.lessons.filter((l) => (body.leaveLessonIds ?? []).includes(l.id));
      const partnerLessons = data.lessons.filter((l) => (body.partnerLessonIds ?? []).includes(l.id));
      const partnerDay = weekdayFromIsoDate(body.partnerDate);
      if (!partnerDay) return fail("調往日期唔係上課日");
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
      );
    }
    if (!record) return fail("未有調堂紀錄");
    if ("error" in record) return fail(record.error);
    const store = loadSwapStore();
    const conflict = swapConflicts(store.swaps, record);
    if (conflict) return fail(conflict);
    const next = { swaps: [record, ...store.swaps].slice(0, 200) };
    saveSwapStore(next);
    return { ok: true, saved: record, swaps: next.swaps };
  }

  if (action === "add") {
    if (!body.leaveTeacherId || !body.leaveDate || !body.leavePeriodId || !body.partnerDate || !body.partnerPeriodId) {
      return fail("請填原課堂同調往日期／節次");
    }
    const record = confirmedSwapManual(data, {
      leaveTeacherId: body.leaveTeacherId,
      leaveDate: body.leaveDate,
      leavePeriodId: body.leavePeriodId,
      partnerDate: body.partnerDate,
      partnerPeriodId: body.partnerPeriodId,
      partnerTeacherId: body.partnerTeacherId || undefined,
    });
    if ("error" in record) return fail(record.error);
    const conflict = swapConflicts(loadSwapStore().swaps, record);
    if (conflict) return fail(conflict);
    const next = { swaps: [record, ...loadSwapStore().swaps].slice(0, 200) };
    saveSwapStore(next);
    return { ok: true, saved: record, swaps: next.swaps };
  }

  if (action === "update") {
    const swapId = body.swapId;
    if (!swapId) return fail("未指定要修改嘅紀錄");
    if (!body.leaveTeacherId || !body.leaveDate || !body.leavePeriodId || !body.partnerDate || !body.partnerPeriodId) {
      return fail("請填原課堂同調往日期／節次");
    }
    const revised = reviseConfirmedSwap(data, loadSwapStore().swaps, swapId, {
      leaveTeacherId: body.leaveTeacherId,
      leaveDate: body.leaveDate,
      leavePeriodId: body.leavePeriodId,
      partnerDate: body.partnerDate,
      partnerPeriodId: body.partnerPeriodId,
      partnerTeacherId: body.partnerTeacherId || undefined,
    });
    if ("error" in revised) return fail(revised.error);
    saveSwapStore({ swaps: revised.swaps });
    return { ok: true, saved: revised.saved, swaps: revised.swaps };
  }

  if (action === "undo") {
    const swapId = body.swapId;
    if (!swapId) return fail("未指定要刪除嘅紀錄");
    const store = loadSwapStore();
    const removed = store.swaps.find((s) => s.id === swapId);
    if (!removed) return fail("找不到要撤銷嘅調堂紀錄");
    const next = { swaps: store.swaps.filter((s) => s.id !== swapId) };
    saveSwapStore(next);
    return { ok: true, swaps: next.swaps };
  }

  return fail("未知操作");
}

function scheduleForDate(data: ScheduleData, date: string) {
  return applyConfirmedSwaps(data, date, loadSwapStore().swaps);
}

export function localCoverGet() {
  return { ...loadCoverStore(), swaps: loadSwapStore().swaps };
}

export function localCoverPost(data: ScheduleData, body: CoverBody) {
  const action = body.action;
  const store = loadCoverStore();

  if (action === "preview") {
    const date = body.date ?? "";
    const closed = coverDateError(date);
    if (closed) return fail(closed);
    const day = weekdayFromIsoDate(date);
    if (!day) return fail("請揀上課日（星期一至五）");
    const absentees = body.absenteeIds ?? [];
    if (absentees.length === 0) return fail("請先勾選請假同事");
    const effective = scheduleForDate(data, date);
    const plan = generateCoverPlan(effective, day, date, absentees, store.balances, store.plans);
    return { plan, balances: store.balances, swaps: loadSwapStore().swaps };
  }

  if (action === "adjustBalance") {
    const teacherId = body.teacherId?.trim();
    const delta = body.delta;
    if (!teacherId) return fail("請選擇老師");
    if (delta !== 1 && delta !== -1) return fail("結餘只可以 ±1");
    if (!data.teachers.some((t) => t.id === teacherId)) return fail("搵唔到呢位老師");
    const balances = { ...store.balances, [teacherId]: (store.balances[teacherId] ?? 0) + delta };
    const next = { ...store, balances };
    saveCoverStore(next);
    return { ok: true, balances: next.balances, plans: next.plans, swaps: loadSwapStore().swaps };
  }

  if (action === "confirm") {
    const incoming = body.plan;
    if (!incoming) return fail("未有代堂方案");
    const closed = coverDateError(incoming.date);
    if (closed) return fail(closed);
    const effective = scheduleForDate(data, incoming.date);
    const error = validateCoverPlan(effective, incoming, store.balances);
    if (error) return fail(error);
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
    saveCoverStore(next);
    return { ok: true, saved, balances: next.balances, plans: next.plans, swaps: loadSwapStore().swaps };
  }

  if (action === "undo") {
    const planId = body.planId;
    const found = store.plans.find((p) => p.id === planId);
    if (!found) return fail("找不到要撤銷嘅方案");
    const next = {
      balances: undoBalances(store.balances, found),
      plans: store.plans.filter((p) => p.id !== planId),
    };
    saveCoverStore(next);
    return { ok: true, balances: next.balances, plans: next.plans, swaps: loadSwapStore().swaps };
  }

  return fail("未知操作");
}

export async function swapRequest(
  data: ScheduleData | null,
  body?: SwapBody,
  method: "GET" | "POST" = body ? "POST" : "GET",
) {
  if (isStaticExport) {
    if (method === "GET") return localSwapGet();
    if (!data) throw new Error("課表未載入");
    const result = localSwapPost(data, body ?? {});
    if ("error" in result && result.error) throw new Error(result.error);
    return result;
  }
  const res = await fetch("/api/swap", {
    method,
    cache: "no-store",
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "調堂操作失敗");
  return json;
}

export async function coverRequest(
  data: ScheduleData | null,
  body?: CoverBody,
  method: "GET" | "POST" = body ? "POST" : "GET",
) {
  if (isStaticExport) {
    if (method === "GET") return localCoverGet();
    if (!data) throw new Error("課表未載入");
    const result = localCoverPost(data, body ?? {});
    if ("error" in result && result.error) throw new Error(result.error);
    return result;
  }
  const res = await fetch("/api/cover", {
    method,
    cache: "no-store",
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "代堂操作失敗");
  return json;
}
