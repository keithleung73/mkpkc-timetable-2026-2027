"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeftRight, Check, Pencil, Plus, Repeat2, Trash2, X } from "lucide-react";
import { LeaveKindPicker } from "@/components/leave-kind-picker";
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
import { COVER_PERIOD_IDS, dayLabel, formatTimeRange, periodLabel } from "@/lib/constants";
import {
  hkTodayIso,
  weekdayFromIsoDate,
  type SavedCoverPlan,
} from "@/lib/cover";
import {
  cycleLeaveKind,
  DEFAULT_LEAVE_KIND,
  leaveKindLabel,
  type LeaveKind,
} from "@/lib/leave";
import { classNames, roomName } from "@/lib/queries";
import {
  calendarLabelsOn,
  schoolClosedReason,
  swapBlockedReason,
} from "@/lib/school-calendar";
import { filterTeachers } from "@/lib/search";
import type { CoverSuggestion, SwapMatch, SwapPlan, SwapUnitResult } from "@/lib/swap";
import { swapRecordKey, type ConfirmedSwap } from "@/lib/swap-records";
import { coverRequest, swapRequest } from "@/lib/web-ops";
import { cn } from "@/lib/utils";

export default function SwapPage() {
  return (
    <PageBody>
      <PageHeader
        title="調堂安排"
        description="老師病假／事假／公假要調堂：可即時揀建議再轉入紀錄。公假不計算代堂 ±。IAL 選修會一拼調；調唔到可揀代堂建議入帳。學校假期、統測、考試同深度學習周沒有正規課堂，不能調堂亦不能代堂。"
      />
      <ScheduleGate>
        <SwapInner />
      </ScheduleGate>
    </PageBody>
  );
}

function SwapInner() {
  const { data } = useSchedule();
  const [teacherId, setTeacherId] = useState("");
  const [q, setQ] = useState("");
  const [leaveDates, setLeaveDates] = useState<string[]>([]);
  const [leaveKinds, setLeaveKinds] = useState<Record<string, LeaveKind>>({});
  const [draftLeaveKind, setDraftLeaveKind] = useState<LeaveKind>(DEFAULT_LEAVE_KIND);
  const [leaveDraft, setLeaveDraft] = useState(hkTodayIso());
  const [swapFromDate, setSwapFromDate] = useState(hkTodayIso());
  const [plan, setPlan] = useState<SwapPlan | null>(null);
  const [swaps, setSwaps] = useState<ConfirmedSwap[]>([]);
  const [coverPlans, setCoverPlans] = useState<SavedCoverPlan[]>([]);
  const [editing, setEditing] = useState<ConfirmedSwap | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void swapRequest(null, undefined, "GET")
      .then((json) => {
        if (!cancelled) setSwaps((json as { swaps?: ConfirmedSwap[] }).swaps ?? []);
      })
      .catch(() => {
        /* 未有紀錄 */
      });
    void coverRequest(null, undefined, "GET")
      .then((json) => {
        if (!cancelled) setCoverPlans((json as { plans?: SavedCoverPlan[] }).plans ?? []);
      })
      .catch(() => {
        /* 未有代堂紀錄 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const teachers = useMemo(
    () => filterTeachers(data?.teachers ?? [], q),
    [data, q],
  );

  if (!data) return null;

  const addLeaveDate = () => {
    if (!weekdayFromIsoDate(leaveDraft)) {
      toast.error("請假日只能揀星期一至五");
      return;
    }
    if (leaveDates.includes(leaveDraft)) {
      toast.message("呢日已加入");
      return;
    }
    const closed = schoolClosedReason(leaveDraft);
    if (closed) {
      toast.message(`${closed}，無需調堂及代堂，但仍會記喺請假日。`);
    } else {
      const blocked = swapBlockedReason(leaveDraft);
      if (blocked) toast.message(`${blocked}會改為代堂建議。`);
    }
    setLeaveDates((cur) => [...cur, leaveDraft].sort());
    setLeaveKinds((cur) => ({ ...cur, [leaveDraft]: draftLeaveKind }));
    setPlan(null);
  };

  const generate = async () => {
    if (!teacherId) {
      toast.error("請選擇請假老師");
      return;
    }
    if (leaveDates.length === 0) {
      toast.error("請加入至少一日病假／事假／公假");
      return;
    }
    if (!weekdayFromIsoDate(swapFromDate)) {
      toast.error("調堂開始日只能揀星期一至五");
      return;
    }
    setBusy(true);
    try {
      const json = (await swapRequest(data, { teacherId, leaveDates, swapFromDate })) as {
        plan: SwapPlan;
        swaps?: ConfirmedSwap[];
      };
      setPlan(json.plan);
      if (Array.isArray(json.swaps)) setSwaps(json.swaps);
      const s = (json.plan as SwapPlan).summary;
      toast.success(`已分析 ${s.total} 項：可調 ${s.swap} · 代堂建議 ${s.cover} · 不可調 ${s.blocked}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "產生失敗");
    } finally {
      setBusy(false);
    }
  };

  const selectedTeacher = data.teachers.find((t) => t.id === teacherId);

  const leaveKindForDate = (date: string): LeaveKind =>
    leaveKinds[date] ?? draftLeaveKind;

  const confirmSwap = async (result: SwapUnitResult, swap: SwapMatch) => {
    setBusy(true);
    try {
      const json = (await swapRequest(data, {
        action: "confirm",
        leaveTeacherId: teacherId,
        leaveDate: result.unit.leaveDate,
        leavePeriodId: result.unit.periodId,
        leaveLessonIds: result.unit.lessons.map((l) => l.id),
        partnerDate: swap.partnerDate,
        partnerPeriodId: swap.partnerPeriodId,
        partnerLessonIds: swap.partnerLessons.map((l) => l.id),
        reason: swap.reason,
        leaveKind: leaveKindForDate(result.unit.leaveDate),
      })) as { swaps?: ConfirmedSwap[] };
      setSwaps(json.swaps ?? []);
      toast.success("已轉入調堂紀錄；之後代堂會跟呢份安排");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "轉入失敗");
    } finally {
      setBusy(false);
    }
  };

  const recordCover = async (result: SwapUnitResult, cover: CoverSuggestion) => {
    setBusy(true);
    try {
      const kind = leaveKindForDate(result.unit.leaveDate);
      const json = (await coverRequest(data, {
        action: "recordSlot",
        date: result.unit.leaveDate,
        absenteeId: teacherId,
        periodId: result.unit.periodId,
        coverTeacherId: cover.teacherId,
        leaveKind: kind,
      })) as { plans?: SavedCoverPlan[] };
      setCoverPlans(json.plans ?? []);
      toast.success(
        kind === "official"
          ? `已轉入代堂紀錄（${leaveKindLabel(kind)}不計 ±）`
          : `已轉入代堂紀錄（${leaveKindLabel(kind)}）`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "轉入代堂失敗");
    } finally {
      setBusy(false);
    }
  };

  const undoSwap = async (swapId: string) => {
    setBusy(true);
    try {
      const json = (await swapRequest(data, { action: "undo", swapId })) as { swaps?: ConfirmedSwap[] };
      setSwaps(json.swaps ?? []);
      setEditing((cur) => (cur?.id === swapId ? null : cur));
      toast.success("已刪除調堂紀錄");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "撤銷失敗");
    } finally {
      setBusy(false);
    }
  };

  const confirmedKeys = new Set(swaps.map((s) => swapRecordKey(s)));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>工作項目：老師病假／事假／公假要調堂安排</CardTitle>
          <CardDescription>
            1）揀請假種類同日期（可多日）　2）揀由邊日開始搵調堂　3）即時揀建議再轉入紀錄　4）公假不計算代堂 ±　5）高中選修並行時段唔可單獨調　6）IAL
            同一時段一拼調
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">請假老師</span>
              <Input
                placeholder="搜尋姓名／簡稱／英文"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <Select
                value={teacherId}
                onValueChange={(v) => {
                  setTeacherId(typeof v === "string" ? v : "");
                  setPlan(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇老師" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}（{t.code}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTeacher ? (
                <p className="text-xs text-muted-foreground">
                  已選：{selectedTeacher.name}
                  {selectedTeacher.englishName ? ` · ${selectedTeacher.englishName}` : ""}
                </p>
              ) : null}
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">由邊日開始調堂（上課日）</span>
              <Input
                type="date"
                value={swapFromDate}
                onChange={(e) => {
                  setSwapFromDate(e.target.value);
                  setPlan(null);
                }}
              />
              <p className="text-xs text-muted-foreground">
                {swapBlockedReason(swapFromDate)
                  ? `${swapBlockedReason(swapFromDate)}搜尋時會自動跳過假期、統測、考試同深度學習周。`
                  : weekdayFromIsoDate(swapFromDate)
                    ? `會由${dayLabel(weekdayFromIsoDate(swapFromDate)!)}起優先搜尋可對調節次`
                    : "請揀星期一至五"}
              </p>
            </label>
          </div>

          <div className="grid gap-2">
            <span className="text-sm text-muted-foreground">請假種類同日期（可多日）</span>
            <LeaveKindPicker value={draftLeaveKind} onChange={setDraftLeaveKind} />
            <p className="text-xs text-muted-foreground">
              公假仍可調堂／代堂，但入帳時不計算請假人 −1、代堂人 +1。
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Input
                type="date"
                className="w-44"
                value={leaveDraft}
                onChange={(e) => setLeaveDraft(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={addLeaveDate}>
                <Plus />
                加入日期
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {leaveDates.length === 0 ? (
                <p className="text-sm text-muted-foreground">尚未加入請假日</p>
              ) : (
                leaveDates.map((d) => {
                  const day = weekdayFromIsoDate(d);
                  const labels = calendarLabelsOn(d);
                  const kind = leaveKinds[d] ?? DEFAULT_LEAVE_KIND;
                  return (
                    <Badge key={d} variant="secondary" className="gap-1 pr-1">
                      <button
                        type="button"
                        className="rounded px-0.5 hover:bg-black/10"
                        onClick={() => {
                          setLeaveKinds((cur) => ({ ...cur, [d]: cycleLeaveKind(kind) }));
                          setPlan(null);
                        }}
                        title="撳一下轉請假種類"
                      >
                        {leaveKindLabel(kind)}
                        {kind === "official" ? "·不計±" : ""}
                      </button>
                      {d}
                      {day ? ` ${dayLabel(day)}` : ""}
                      {labels.length ? ` · ${labels.join("、")}` : ""}
                      <button
                        type="button"
                        className="rounded p-0.5 hover:bg-black/10"
                        onClick={() => {
                          setLeaveDates((cur) => cur.filter((x) => x !== d));
                          setLeaveKinds((cur) => {
                            const next = { ...cur };
                            delete next[d];
                            return next;
                          });
                          setPlan(null);
                        }}
                        aria-label={`移除 ${d}`}
                      >
                        <X className="size-3.5" />
                      </button>
                    </Badge>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void generate()}>
              <ArrowLeftRight />
              產生調堂／代堂建議
            </Button>
            <Link
              href="/cover"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
            >
              <Repeat2 className="size-4" />
              前往代堂編配
            </Link>
          </div>
        </CardContent>
      </Card>

      <ManualSwapForm
        teacherId={editing?.leaveTeacherId ?? teacherId}
        editing={editing}
        onTeacherNeeded={() => toast.error("請先選擇請假老師")}
        busy={busy}
        onSaved={(next) => {
          setSwaps(next);
          setEditing(null);
        }}
        onCancelEdit={() => setEditing(null)}
      />

      {swaps.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>已確認調堂紀錄</CardTitle>
            <CardDescription>可人手修改或刪除。代堂編配會跟呢啲紀錄，而唔係原先課表。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {swaps.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span>
                  {s.leaveKind ? `${leaveKindLabel(s.leaveKind)} · ` : ""}
                  {s.leaveTeacherName} {s.leaveDate} {periodLabel(s.leavePeriodId)}
                  {s.leaveSubjects.length ? ` ${s.leaveSubjects.join("、")}` : ""}
                  {" → "}
                  {s.partnerDate} {periodLabel(s.partnerPeriodId)}
                  {s.partnerTeacherNames.length ? `（${s.partnerTeacherNames.join("、")}）` : "（空堂／CLP）"}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={editing?.id === s.id ? "default" : "outline"}
                    disabled={busy}
                    onClick={() => {
                      setTeacherId(s.leaveTeacherId);
                      setEditing(s);
                    }}
                  >
                    <Pencil />
                    修改
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void undoSwap(s.id)}>
                    <Trash2 />
                    刪除
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

          {plan ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge>{plan.teacherName}</Badge>
            <Badge variant="outline">可調 {plan.summary.swap}</Badge>
            <Badge variant="outline">代堂建議 {plan.summary.cover}</Badge>
            <Badge variant="outline">不可調 {plan.summary.blocked}</Badge>
            <span className="text-muted-foreground">
              請假 {plan.leaveDates.join("、")} · 由 {plan.swapFromDate} 起搵調堂
            </span>
          </div>
          {plan.notes.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {plan.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}

          {plan.results.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                所選請假日無需處理嘅授課堂（學校假期／統測／考試／深度學習周／無堂日，或當日無課）。
              </CardContent>
            </Card>
          ) : (
            plan.results.map((r) => (
              <ResultCard
                key={r.unit.id}
                result={r}
                leaveKind={leaveKindForDate(r.unit.leaveDate)}
                confirmed={confirmedKeys.has(
                  swapRecordKey({
                    leaveTeacherId: teacherId,
                    leaveDate: r.unit.leaveDate,
                    leavePeriodId: r.unit.periodId,
                  }),
                )}
                recordedCover={coverPlans.some(
                  (p) =>
                    p.date === r.unit.leaveDate &&
                    p.assignments.some(
                      (a) => a.absenteeId === teacherId && a.periodId === r.unit.periodId,
                    ),
                )}
                busy={busy}
                onConfirmSwap={(swap) => void confirmSwap(r, swap)}
                onRecordCover={(cover) => void recordCover(r, cover)}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function statusBadge(status: SwapUnitResult["status"]) {
  if (status === "swap") return <Badge className="bg-emerald-700 hover:bg-emerald-700">可調堂</Badge>;
  if (status === "cover") return <Badge variant="destructive">調唔到 · 代堂建議</Badge>;
  return <Badge variant="secondary">不可調堂</Badge>;
}

function ResultCard({
  result,
  leaveKind,
  confirmed,
  recordedCover,
  busy,
  onConfirmSwap,
  onRecordCover,
}: {
  result: SwapUnitResult;
  leaveKind: LeaveKind;
  confirmed?: boolean;
  recordedCover?: boolean;
  busy?: boolean;
  onConfirmSwap?: (swap: SwapMatch) => void;
  onRecordCover?: (cover: CoverSuggestion) => void;
}) {
  const { data } = useSchedule();
  const { unit, status, coverSuggestions, blockers } = result;
  const swapOptions = result.swaps?.length ? result.swaps : result.swap ? [result.swap] : [];
  const [swapIdx, setSwapIdx] = useState(0);
  const [coverId, setCoverId] = useState(coverSuggestions[0]?.teacherId ?? "");
  const selectedSwap = swapOptions[Math.min(swapIdx, Math.max(swapOptions.length - 1, 0))];
  const selectedCover =
    coverSuggestions.find((c) => c.teacherId === coverId) ?? coverSuggestions[0];
  if (!data) return null;

  return (
    <Card
      className={cn(
        status === "swap" && "border-emerald-200",
        status === "cover" && "border-destructive/30",
        status === "blocked" && "border-amber-200",
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {statusBadge(status)}
          <Badge variant="outline">
            {leaveKindLabel(leaveKind)}
            {leaveKind === "official" ? " · 不計±" : ""}
          </Badge>
          {unit.kind === "ial_bundle" ? <Badge variant="outline">IAL 一拼</Badge> : null}
          {unit.kind === "elective_blocked" ? <Badge variant="outline">選修並行</Badge> : null}
          <CardTitle className="text-base">{unit.label}</CardTitle>
        </div>
        <CardDescription>
          請假日 {unit.leaveDate}（{dayLabel(unit.day)}）· {periodLabel(unit.periodId)}{" "}
          {formatTimeRange(unit.day, unit.periodId)} · {classNames(data, unit.classIds)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">科目</th>
                <th className="px-3 py-2 font-medium">老師</th>
                <th className="px-3 py-2 font-medium">班</th>
                <th className="px-3 py-2 font-medium">地點</th>
              </tr>
            </thead>
            <tbody>
              {unit.lessons.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="px-3 py-2">{l.subject}</td>
                  <td className="px-3 py-2">
                    {l.teacherIds.map((id) => data.teachers.find((t) => t.id === id)?.name ?? id).join("、")}
                  </td>
                  <td className="px-3 py-2">{classNames(data, l.classIds)}</td>
                  <td className="px-3 py-2">{roomName(data, l.roomId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {swapOptions.length > 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:bg-emerald-950/20">
            <p className="font-medium text-emerald-900 dark:text-emerald-100">
              {swapOptions.length > 1 ? `調堂建議（${swapOptions.length} 個，即時揀一個轉入紀錄）` : "調堂建議"}
            </p>
            <div className="mt-2 space-y-2">
              {swapOptions.map((opt, i) => (
                <label
                  key={`${opt.partnerDate}|${opt.partnerPeriodId}|${opt.partnerTeacherIds.join(",")}`}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md border bg-background/70 px-2 py-2",
                    i === swapIdx && "border-emerald-600 ring-1 ring-emerald-600/40",
                  )}
                >
                  <input
                    type="radio"
                    className="mt-1"
                    name={`swap-${unit.id}`}
                    checked={i === swapIdx}
                    onChange={() => setSwapIdx(i)}
                  />
                  <span>
                    <span className="block font-medium">{opt.reason}</span>
                    <span className="block text-muted-foreground">
                      對調至 {opt.partnerDate} {dayLabel(opt.partnerDay)} {periodLabel(opt.partnerPeriodId)}
                      （{formatTimeRange(opt.partnerDay, opt.partnerPeriodId)}）· 對手：
                      {opt.partnerTeacherNames.join("、") || "空堂／CLP"} · {opt.partnerSubjects.join("、")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {onConfirmSwap && selectedSwap ? (
              <div className="mt-2">
                {confirmed ? (
                  <Badge className="bg-emerald-700 hover:bg-emerald-700">已轉入調堂紀錄</Badge>
                ) : (
                  <Button size="sm" disabled={busy} onClick={() => onConfirmSwap(selectedSwap)}>
                    <Check />
                    轉入紀錄
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {blockers.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : null}

        {coverSuggestions.length > 0 ? (
          <div>
            <p className="mb-2 font-medium">代堂建議（該節空閒老師，可即時揀再轉入紀錄）</p>
            <div className="space-y-2">
              {coverSuggestions.map((c) => (
                <label
                  key={c.teacherId}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border px-2 py-2",
                    selectedCover?.teacherId === c.teacherId && "border-foreground ring-1 ring-foreground/20",
                  )}
                >
                  <input
                    type="radio"
                    className="mt-0.5"
                    name={`cover-${unit.id}`}
                    checked={selectedCover?.teacherId === c.teacherId}
                    onChange={() => setCoverId(c.teacherId)}
                  />
                  <span>
                    {c.teacherName}（{c.teacherCode}）
                    {c.sameSubject ? " · 同科" : ""}
                    {c.teachesClass ? " · 任教該班" : ""}
                    · 當日 {c.lessonsToday} 堂
                  </span>
                </label>
              ))}
            </div>
            {onRecordCover && selectedCover ? (
              <div className="mt-2">
                {recordedCover ? (
                  <Badge variant="secondary">已轉入代堂紀錄</Badge>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onRecordCover(selectedCover)}>
                    <Check />
                    轉入紀錄
                    {leaveKind === "official" ? "（公假不計±）" : ""}
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ManualSwapForm({
  teacherId,
  editing,
  onTeacherNeeded,
  busy,
  onSaved,
  onCancelEdit,
}: {
  teacherId: string;
  editing: ConfirmedSwap | null;
  onTeacherNeeded: () => void;
  busy: boolean;
  onSaved: (swaps: ConfirmedSwap[]) => void;
  onCancelEdit: () => void;
}) {
  const { data } = useSchedule();
  const [leaveDate, setLeaveDate] = useState(hkTodayIso());
  const [leavePeriodId, setLeavePeriodId] = useState("p3");
  const [partnerDate, setPartnerDate] = useState(hkTodayIso());
  const [partnerPeriodId, setPartnerPeriodId] = useState("p3");
  const [partnerQ, setPartnerQ] = useState("");
  const [partnerTeacherId, setPartnerTeacherId] = useState("");
  const [leaveKind, setLeaveKind] = useState<LeaveKind>(DEFAULT_LEAVE_KIND);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setLeaveDate(editing.leaveDate);
    setLeavePeriodId(editing.leavePeriodId);
    setPartnerDate(editing.partnerDate);
    setPartnerPeriodId(editing.partnerPeriodId);
    setPartnerTeacherId(editing.partnerTeacherIds[0] ?? "");
    setLeaveKind(editing.leaveKind ?? DEFAULT_LEAVE_KIND);
    setPartnerQ("");
  }, [editing]);

  const partners = useMemo(
    () => filterTeachers(data?.teachers ?? [], partnerQ),
    [data, partnerQ],
  );

  if (!data) return null;

  const save = async () => {
    if (!teacherId) {
      onTeacherNeeded();
      return;
    }
    setSaving(true);
    try {
      const json = (await swapRequest(data, {
        action: editing ? "update" : "add",
        swapId: editing?.id,
        leaveTeacherId: teacherId,
        leaveDate,
        leavePeriodId,
        partnerDate,
        partnerPeriodId,
        partnerTeacherId: partnerTeacherId || undefined,
        leaveKind,
      })) as { swaps?: ConfirmedSwap[] };
      onSaved(json.swaps ?? []);
      toast.success(editing ? "已修改調堂紀錄" : "已人手加入調堂紀錄");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : editing ? "修改失敗" : "加入失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{editing ? "修改已確認調堂紀錄" : "人手加入調堂紀錄（＋）"}</CardTitle>
        <CardDescription>
          {editing
            ? `正在改 ${editing.leaveTeacherName} ${editing.leaveDate} ${periodLabel(editing.leavePeriodId)}。儲存後代堂會跟新安排。`
            : "例如將課堂調去原本空堂／CLP。對手老師可留空（只搬去該節）。已確認紀錄可人手修改或刪除。"}
          {" "}
          學校假期、統測、考試同深度學習周沒有正規課堂，不能加入或改去嗰啲日子。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">原課堂日期</span>
            <Input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
            {swapBlockedReason(leaveDate) ? (
              <p className="text-xs text-destructive">{swapBlockedReason(leaveDate)}</p>
            ) : null}
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">原節次</span>
            <Select value={leavePeriodId} onValueChange={(v) => setLeavePeriodId(typeof v === "string" ? v : "p3")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COVER_PERIOD_IDS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {periodLabel(id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">調往日期</span>
            <Input type="date" value={partnerDate} onChange={(e) => setPartnerDate(e.target.value)} />
            {swapBlockedReason(partnerDate) ? (
              <p className="text-xs text-destructive">{swapBlockedReason(partnerDate)}</p>
            ) : null}
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">調往節次</span>
            <Select
              value={partnerPeriodId}
              onValueChange={(v) => setPartnerPeriodId(typeof v === "string" ? v : "p3")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COVER_PERIOD_IDS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {periodLabel(id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">對手老師（可留空＝調去空堂／CLP）</span>
            <Input
              placeholder="搜尋姓名／簡稱"
              value={partnerQ}
              onChange={(e) => setPartnerQ(e.target.value)}
            />
            <Select
              value={partnerTeacherId || "none"}
              onValueChange={(v) =>
                setPartnerTeacherId(typeof v === "string" && v !== "none" ? v : "")
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="可留空" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="none">（無對手／空堂／CLP）</SelectItem>
                {partners.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}（{t.code}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">請假種類</span>
            <LeaveKindPicker value={leaveKind} onChange={setLeaveKind} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy || saving} onClick={() => void save()}>
            {editing ? <Check /> : <Plus />}
            {editing ? "儲存修改" : "加入紀錄"}
          </Button>
          {editing ? (
            <Button type="button" variant="ghost" disabled={busy || saving} onClick={onCancelEdit}>
              <X />
              取消修改
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
