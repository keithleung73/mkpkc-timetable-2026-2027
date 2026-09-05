"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileDown, Minus, Plus, Repeat2 } from "lucide-react";
import { PageBody, PageHeader, ScheduleGate } from "@/components/page-chrome";
import { useSchedule } from "@/components/schedule-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignmentKey,
  buildCoverDatesByTeacher,
  COVER_AVOID_TEACHER_NAMES,
  eligibleCoverTeachers,
  generateCoverPlan,
  hkTodayIso,
  MAX_CONSECUTIVE_COVER_DAYS,
  MAX_OWN_LESSONS,
  previewDeltas,
  reassignCover,
  slotKey,
  teachingLessonsOnDay,
  weekdayFromIsoDate,
  type CoverBalances,
  type CoverPickContext,
  type CoverPlan,
  type SavedCoverPlan,
} from "@/lib/cover";
import { dayLabel, formatTimeRange, periodLabel } from "@/lib/constants";
import { classNames, roomName } from "@/lib/queries";
import type { ScheduleData, Teacher } from "@/lib/types";
import { coverPdfFilename } from "@/lib/cover-pdf";
import { filterTeachers, teacherEnglishLabels } from "@/lib/search";
import { applyConfirmedSwaps, swapsAffectingDate, type ConfirmedSwap } from "@/lib/swap-records";
import { coverDateError, schoolClosedReason } from "@/lib/school-calendar";
import { coverRequest } from "@/lib/web-ops";
import { printCoverPlan } from "@/lib/cover-print";
import { isStaticExport } from "@/lib/runtime";
import { cn } from "@/lib/utils";

type CoverStorePayload = {
  balances: CoverBalances;
  plans: SavedCoverPlan[];
  swaps?: ConfirmedSwap[];
};

export default function CoverPage() {
  return (
    <PageBody>
      <PageHeader
        title="代堂編配"
        description="勾選當日請假同事，系統按已確認調堂後嘅課表編配代堂（唔再用原先空堂）。盡量避開指定同事，同一星期亦盡量唔連續代多過兩日。學校假期、統測、考試、深度學習周同其他無堂日沒有正規課堂，不能調堂亦不能代堂。"
      />
      <ScheduleGate>
        <Inner />
      </ScheduleGate>
    </PageBody>
  );
}

function Inner() {
  const { data } = useSchedule();
  const [date, setDate] = useState(hkTodayIso);
  const [absentees, setAbsentees] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [balances, setBalances] = useState<CoverBalances>({});
  const [history, setHistory] = useState<SavedCoverPlan[]>([]);
  const [plan, setPlan] = useState<CoverPlan | null>(null);
  const [swaps, setSwaps] = useState<ConfirmedSwap[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState("請假");

  const day = weekdayFromIsoDate(date);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("date");
    if (fromUrl && weekdayFromIsoDate(fromUrl)) setDate(fromUrl);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void coverRequest(null, undefined, "GET")
      .then((json) => {
        if (cancelled) return;
        const payload = json as CoverStorePayload;
        setBalances(payload.balances ?? {});
        setHistory(payload.plans ?? []);
        setSwaps(payload.swaps ?? []);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "載入失敗");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const savedToday = useMemo(
    () => history.find((p) => p.date === date) ?? null,
    [history, date],
  );

  const effectiveData = useMemo(
    () => (data ? applyConfirmedSwaps(data, date, swaps) : null),
    [data, date, swaps],
  );
  const daySwaps = useMemo(() => swapsAffectingDate(swaps, date), [swaps, date]);

  const teachers = data?.teachers ?? [];
  const filtered = useMemo(
    () => filterTeachers(data?.teachers ?? [], q),
    [data, q],
  );

  const listed = useMemo(() => {
    const selected = filtered.filter((t) => absentees.includes(t.id));
    const rest = filtered.filter((t) => !absentees.includes(t.id));
    return [...selected, ...rest];
  }, [filtered, absentees]);

  if (!data || !effectiveData) return null;

  const toggle = (id: string) => {
    setAbsentees((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    setPlan(null);
  };

  const generate = () => {
    const closed = coverDateError(date);
    if (closed) {
      toast.error(closed);
      return;
    }
    if (!day) {
      toast.error("請揀星期一至五");
      return;
    }
    if (absentees.length === 0) {
      toast.error("請先勾選請假同事");
      return;
    }
    const next = generateCoverPlan(effectiveData, day, date, absentees, balances, history);
    setPlan(next);
    if (next.slots.length === 0) {
      toast.message("所選同事當日無需要代嘅堂");
    } else if (next.leftover.length > 0) {
      toast.warning(`已編 ${next.assignments.length} 堂，仍有 ${next.leftover.length} 堂未能編配`);
    } else {
      toast.success(`已編配 ${next.assignments.length} 堂代堂`);
    }
  };

  const confirm = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const json = (await coverRequest(data, { action: "confirm", plan })) as CoverStorePayload & {
        swaps?: ConfirmedSwap[];
      };
      setBalances(json.balances);
      setHistory(json.plans);
      if (Array.isArray(json.swaps)) setSwaps(json.swaps);
      setPlan(null);
      toast.success("已將代堂結餘入帳");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "入帳失敗");
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = async (target: CoverPlan) => {
    setBusy(true);
    try {
      if (isStaticExport) {
        printCoverPlan(target, data, reason);
        toast.success("請用瀏覽器列印對話框另存 PDF");
        return;
      }
      const res = await fetch("/api/cover/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: target, reason }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "匯出 PDF 失敗");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = coverPdfFilename(target.date);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("已下載調堂 PDF");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "匯出失敗");
    } finally {
      setBusy(false);
    }
  };

  const undo = async (planId: string) => {
    setBusy(true);
    try {
      const json = (await coverRequest(data, { action: "undo", planId })) as CoverStorePayload;
      setBalances(json.balances);
      setHistory(json.plans);
      if (Array.isArray(json.swaps)) setSwaps(json.swaps);
      toast.success("已撤銷該日入帳");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "撤銷失敗");
    } finally {
      setBusy(false);
    }
  };

  const adjustBalance = async (teacherId: string, delta: 1 | -1) => {
    setBusy(true);
    try {
      const json = (await coverRequest(data, { action: "adjustBalance", teacherId, delta })) as CoverStorePayload;
      setBalances(json.balances);
      if (Array.isArray(json.swaps)) setSwaps(json.swaps);
      toast.success(`已人手${delta > 0 ? "+1" : "−1"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "改結餘失敗");
    } finally {
      setBusy(false);
    }
  };

  const ranking = [...teachers]
    .map((t) => ({ teacher: t, balance: balances[t.id] ?? 0 }))
    .sort(
      (a, b) =>
        a.balance - b.balance || a.teacher.name.localeCompare(b.teacher.name, "zh-Hant"),
    );

  return (
    <div className="space-y-6">
      {loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>編配規則</CardTitle>
          <CardDescription>請假無返扣分，代堂加分。揀人只睇結餘，唔睇科目。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <p>請假同事每堂 −1；成功代堂同事每堂 +1。未能編配嘅堂，請假人仍然扣分。</p>
          <p>病假／請假較多（結餘較負）者優先代堂，其後先睇當日原有堂數。</p>
          <p>當日原有課堂多於 {MAX_OWN_LESSONS} 節者不能代堂。</p>
          <p>學校假期、統測、考試、深度學習周、陸運會、開放日、教師發展日等無堂日無需代堂。</p>
          <p>同一人唔可以連續兩節代堂（例如代完第三節就不能代第四節）；同自己原本課堂相鄰則可以。</p>
          <p>已確認調堂會改當日佔用：被調去上課嘅同事該節不能代堂。CLP 唔當正規課，唔擋調堂／代堂。</p>
          <p>
            盡量唔編：{COVER_AVOID_TEACHER_NAMES.join("、")}
            （無人可代時仍可編；亦可人手改派）。
          </p>
          <p>
            同一星期盡量唔連續代堂多於 {MAX_CONSECUTIVE_COVER_DAYS}{" "}
            日（例如一、二已代，三會優先派其他人）。
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">日期</span>
          <Input
            type="date"
            className="w-44"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setAbsentees([]);
              setPlan(null);
            }}
          />
        </label>
        <div className="text-sm text-muted-foreground">
          {schoolClosedReason(date) ? (
            <span>{schoolClosedReason(date)}</span>
          ) : day ? (
            <span>
              {dayLabel(day)}
              {date === hkTodayIso() ? " · 今日" : ""}
            </span>
          ) : (
            <span>唔係上課日（星期六／日）</span>
          )}
        </div>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">調堂事源</span>
          <Input
            className="w-56"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例如：請假、交流團、病假"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDate(hkTodayIso());
            setAbsentees([]);
            setPlan(null);
          }}
        >
          今日
        </Button>
      </div>

      {coverDateError(date) ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>{coverDateError(date)}</p>
          <p className="mt-1 text-amber-900/80">
            假期、統測、考試、深度學習周、陸運會、開放日、畢業典禮同教師發展日都沒有正規課堂，不用調堂亦不用代堂。
          </p>
        </div>
      ) : null}

      {savedToday ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          呢日已有入帳方案（{savedToday.assignments.length} 堂已編、
          {savedToday.leftover.length} 堂未編）。再確認會覆蓋當日結餘。
          <Button
            className="ml-3"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void undo(savedToday.id)}
          >
            撤銷當日入帳
          </Button>
          <Button
            className="ml-2"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void exportPdf(savedToday)}
          >
            <FileDown />
            匯出 PDF
          </Button>
        </div>
      ) : null}

      {day && daySwaps.length > 0 ? (
        <div className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          當日已套用 {daySwaps.length} 項已確認調堂；代堂空閒以調堂後課表為準。
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            {daySwaps.map((s) => (
              <li key={s.id}>
                {s.leaveTeacherName} {s.leaveDate} {periodLabel(s.leavePeriodId)}
                {" ⇄ "}
                {s.partnerDate} {periodLabel(s.partnerPeriodId)}
                {s.partnerTeacherNames.length ? `（${s.partnerTeacherNames.join("、")}）` : "（空堂／CLP）"}
                {s.leaveSubjects.length ? ` · ${s.leaveSubjects.join("、")}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!day ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          請揀星期一至五，先可以編代堂。
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_1fr]">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">請假同事</h3>
              <span className="text-xs text-muted-foreground">已選 {absentees.length} 人</span>
            </div>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜尋中文／簡稱／英文，例如 Tang"
            />
            {absentees.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {absentees.map((id) => {
                  const t = teachers.find((x) => x.id === id);
                  if (!t) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      className="inline-flex items-center rounded-full bg-[color:var(--school-navy)] px-2.5 py-1 text-xs text-white"
                      onClick={() => toggle(id)}
                    >
                      {t.name}（{t.code}）
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">勾選當日請假、無返校嘅同事。</p>
            )}
            <div className="max-h-[28rem] overflow-y-auto rounded-lg border">
              {listed.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">找不到老師</p>
              ) : (
                listed.map((t) => {
                  const checked = absentees.includes(t.id);
                  const own = teachingLessonsOnDay(effectiveData, t.id, day).length;
                  const bal = balances[t.id] ?? 0;
                  return (
                    <label
                      key={t.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-2 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50",
                        checked && "bg-muted/70",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        onChange={() => toggle(t.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
                          <span>
                            {t.name}
                            <span className="text-muted-foreground">（{t.code}）</span>
                          </span>
                          <BalanceChip value={bal} />
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          當日 {own} 堂
                          {own > MAX_OWN_LESSONS ? " · 超過 6 堂，不能代人" : ""}
                          {teacherEnglishLabels(t)[0] ? ` · ${teacherEnglishLabels(t)[0]}` : ""}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <Button
              className="w-full"
              disabled={absentees.length === 0 || Boolean(coverDateError(date))}
              onClick={generate}
            >
              <Repeat2 />
              產生代堂方案
            </Button>
          </section>

          <section className="min-w-0 space-y-4">
            {!plan ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                勾選請假同事後，撳「產生代堂方案」。可以再人手改代堂人，確認後先入帳。
              </div>
            ) : plan.slots.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                所選同事喺{dayLabel(day)}無需要代嘅堂（會議／課後唔計）。
              </div>
            ) : (
              <PlanTable
                plan={plan}
                scheduleData={effectiveData}
                balances={balances}
                history={history}
                onChange={(next) => setPlan(next)}
                onConfirm={() => void confirm()}
                onExport={() => void exportPdf(plan)}
                busy={busy}
                replaceHint={Boolean(savedToday)}
              />
            )}
          </section>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>代堂結餘</CardTitle>
          <CardDescription>
            負數表示仍欠堂，正數表示已代過。可人手 ±1 改記錄。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ManualBalanceAdjust teachers={teachers} busy={busy} onAdjust={adjustBalance} />
          {ranking.every((r) => r.balance === 0) ? (
            <p className="text-sm text-muted-foreground">尚未入帳。確認方案後先會累計，亦可人手加減。</p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {ranking
                .filter((r) => r.balance !== 0)
                .map((r) => (
                  <div
                    key={r.teacher.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <span>
                      {r.teacher.name}
                      <span className="text-muted-foreground">（{r.teacher.code}）</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-7"
                        disabled={busy}
                        onClick={() => void adjustBalance(r.teacher.id, -1)}
                        aria-label={`${r.teacher.name} 減 1`}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <BalanceChip value={r.balance} />
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-7"
                        disabled={busy}
                        onClick={() => void adjustBalance(r.teacher.id, 1)}
                        aria-label={`${r.teacher.name} 加 1`}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {history.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>最近入帳</CardTitle>
            <CardDescription>撤銷會還原該日加減分。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.slice(0, 8).map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span>
                  {p.date} {dayLabel(p.day)} · 已編 {p.assignments.length}／{p.slots.length} 堂
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void exportPdf(p)}>
                    <FileDown />
                    匯出 PDF
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void undo(p.id)}>
                    撤銷
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ManualBalanceAdjust({
  teachers,
  busy,
  onAdjust,
}: {
  teachers: Teacher[];
  busy: boolean;
  onAdjust: (teacherId: string, delta: 1 | -1) => void;
}) {
  const [q, setQ] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const filtered = useMemo(() => filterTeachers(teachers, q), [teachers, q]);
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
      <label className="grid gap-1 text-sm">
        <span className="text-muted-foreground">人手改結餘</span>
        <Input
          className="w-44"
          placeholder="搜尋老師"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <Select value={teacherId} onValueChange={(v) => setTeacherId(typeof v === "string" ? v : "")}>
        <SelectTrigger className="w-52">
          <SelectValue placeholder="選擇老師" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {filtered.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}（{t.code}）
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || !teacherId}
        onClick={() => onAdjust(teacherId, -1)}
      >
        <Minus />
        −1
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || !teacherId}
        onClick={() => onAdjust(teacherId, 1)}
      >
        <Plus />
        +1
      </Button>
    </div>
  );
}

function BalanceChip({ value }: { value: number }) {
  const label = value > 0 ? `+${value}` : String(value);
  return (
    <Badge
      variant={value < 0 ? "destructive" : value > 0 ? "default" : "secondary"}
      className={cn(value === 0 && "font-normal")}
    >
      {label}
    </Badge>
  );
}

function PlanTable({
  plan,
  scheduleData,
  balances,
  history,
  onChange,
  onConfirm,
  onExport,
  busy,
  replaceHint,
}: {
  plan: CoverPlan;
  scheduleData: ScheduleData;
  balances: CoverBalances;
  history: SavedCoverPlan[];
  onChange: (plan: CoverPlan) => void;
  onConfirm: () => void;
  onExport: () => void;
  busy: boolean;
  replaceHint: boolean;
}) {
  const data = scheduleData;
  const deltas = previewDeltas(plan);
  const absentees = new Set(plan.absentees);
  const pickCtx: CoverPickContext = {
    date: plan.date,
    coverDatesByTeacher: buildCoverDatesByTeacher(history, plan.date),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge>{dayLabel(plan.day)}</Badge>
        <span className="text-muted-foreground">
          需代 {plan.slots.length} 堂 · 已編 {plan.assignments.length} · 未編 {plan.leftover.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">節次</th>
              <th className="px-3 py-2 font-medium">班／科／地點</th>
              <th className="px-3 py-2 font-medium">請假</th>
              <th className="px-3 py-2 font-medium">代堂同事</th>
              <th className="px-3 py-2 font-medium">原因</th>
            </tr>
          </thead>
          <tbody>
            {plan.assignments.map((a) => {
              const key = assignmentKey(a);
              const others = plan.assignments.filter((x) => assignmentKey(x) !== key);
              const slot = plan.slots.find((s) => slotKey(s) === key)!;
              const options = eligibleCoverTeachers(
                data,
                plan.day,
                absentees,
                balances,
                slot,
                others,
                pickCtx,
              );
              return (
                <tr key={key} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {periodLabel(a.periodId)}
                    <div className="text-xs text-muted-foreground">
                      {formatTimeRange(plan.day, a.periodId)}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{classNames(data, a.classIds)}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.subject} · {roomName(data, a.roomId)}
                    </div>
                  </td>
                  <td className="px-3 py-2">{a.absenteeName}</td>
                  <td className="px-3 py-2">
                    <Select
                      value={a.coverTeacherId}
                      onValueChange={(v) => {
                        const id = typeof v === "string" ? v : "";
                        if (!id) return;
                        onChange(reassignCover(data, plan, key, id, balances, history));
                      }}
                    >
                      <SelectTrigger className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((o) => (
                          <SelectItem key={o.teacher.id} value={o.teacher.id}>
                            {o.teacher.name}（{o.teacher.code}）{o.balance}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{a.reason}</td>
                </tr>
              );
            })}
            {plan.leftover.map((s) => {
              const key = slotKey(s);
              const options = eligibleCoverTeachers(
                data,
                plan.day,
                absentees,
                balances,
                s,
                plan.assignments,
                pickCtx,
              );
              return (
                <tr key={key} className="border-t bg-destructive/5">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {periodLabel(s.periodId)}
                    <div className="text-xs text-muted-foreground">
                      {formatTimeRange(plan.day, s.periodId)}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{classNames(data, s.classIds)}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.subject} · {roomName(data, s.roomId)}
                    </div>
                  </td>
                  <td className="px-3 py-2">{s.teacherName}</td>
                  <td className="px-3 py-2">
                    {options.length === 0 ? (
                      <span className="text-xs text-destructive">無人可代</span>
                    ) : (
                      <Select
                        onValueChange={(v) => {
                          const id = typeof v === "string" ? v : "";
                          if (!id) return;
                          onChange(reassignCover(data, plan, key, id, balances, history));
                        }}
                      >
                        <SelectTrigger className="w-52">
                          <SelectValue placeholder="人手指定" />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((o) => (
                            <SelectItem key={o.teacher.id} value={o.teacher.id}>
                              {o.teacher.name}（{o.teacher.code}）{o.balance}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-destructive">未能自動編配</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        入帳預覽：
        {Object.entries(deltas)
          .filter(([, n]) => n !== 0)
          .sort((a, b) => a[1] - b[1])
          .map(([id, n]) => {
            const t = data.teachers.find((x) => x.id === id);
            return (
              <span key={id} className="mr-2">
                {t?.name ?? id} {n > 0 ? `+${n}` : n}
              </span>
            );
          })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onConfirm} disabled={busy}>
          {replaceHint ? "覆蓋並入帳" : "確認入帳"}
        </Button>
        <Button variant="outline" onClick={onExport} disabled={busy}>
          <FileDown />
          匯出 PDF
        </Button>
      </div>
    </div>
  );
}
