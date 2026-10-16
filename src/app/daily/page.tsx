"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeftRight, CalendarClock, Repeat2 } from "lucide-react";
import { PageBody, PageHeader, ScheduleGate } from "@/components/page-chrome";
import { useSchedule } from "@/components/schedule-provider";
import { TeacherMultiPicker } from "@/components/teacher-picker";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dayLabel, periodLabel } from "@/lib/constants";
import {
  dailyAbsenteeRows,
  dailyArrangementLines,
  dailySummary,
  handleStatusLabel,
  loadDailyRoster,
  mergeRosterIds,
  resolveAbsenteeTokens,
  saveDailyRoster,
  type DailyArrangementLine,
  type DailyAbsenteeRow,
  type HandleStatus,
} from "@/lib/daily-board";
import { hkTodayIso, type CoverBalances, type SavedCoverPlan, weekdayFromIsoDate } from "@/lib/cover";
import { schoolClosedReason } from "@/lib/school-calendar";
import type { ConfirmedSwap } from "@/lib/swap-records";
import { coverRequest } from "@/lib/web-ops";
import { cn } from "@/lib/utils";

export default function DailyPage() {
  return (
    <PageBody>
      <PageHeader
        title="當日代調"
        description="即時睇當日已入帳嘅調堂同代堂；亦可人手輸入已知外名單，對照每位同事已處理／未處理。"
      />
      <ScheduleGate>
        <DailyInner />
      </ScheduleGate>
    </PageBody>
  );
}

function DailyInner() {
  const { data } = useSchedule();
  const [date, setDate] = useState(hkTodayIso);
  const [roster, setRoster] = useState<string[]>([]);
  const [paste, setPaste] = useState("");
  const [plans, setPlans] = useState<SavedCoverPlan[]>([]);
  const [swaps, setSwaps] = useState<ConfirmedSwap[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("date");
    if (fromUrl && /^\d{4}-\d{2}-\d{2}$/.test(fromUrl)) setDate(fromUrl);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void coverRequest(null, undefined, "GET")
      .then((json) => {
        if (cancelled) return;
        const payload = json as { balances?: CoverBalances; plans?: SavedCoverPlan[]; swaps?: ConfirmedSwap[] };
        setPlans(payload.plans ?? []);
        setSwaps(payload.swaps ?? []);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setRoster(loadDailyRoster(date));
  }, [date]);

  const updateRoster = (ids: string[]) => {
    const next = [...new Set(ids)];
    setRoster(next);
    saveDailyRoster(date, next);
  };

  const rows = useMemo(
    () => (data ? dailyAbsenteeRows(data, date, roster, plans, swaps) : []),
    [data, date, roster, plans, swaps],
  );
  const lines = useMemo(() => dailyArrangementLines(date, plans, swaps), [date, plans, swaps]);
  const summary = useMemo(() => dailySummary(rows, lines), [rows, lines]);
  const day = weekdayFromIsoDate(date);
  const closed = schoolClosedReason(date);

  if (!data) return null;

  const addPasted = () => {
    const { ids, unmatched } = resolveAbsenteeTokens(data.teachers, paste);
    if (ids.length === 0 && unmatched.length === 0) {
      toast.error("請輸入老師姓名或簡稱");
      return;
    }
    if (ids.length) updateRoster([...roster, ...ids]);
    if (unmatched.length) toast.error(`對唔上：${unmatched.join("、")}`);
    else if (ids.length) toast.success(`已加入 ${ids.length} 人`);
    setPaste("");
  };

  const importKnown = () => {
    const next = mergeRosterIds(date, roster, plans, swaps);
    updateRoster(next);
    toast.message(next.length ? `已帶入 ${next.length} 人（含已入帳）` : "呢日未有已入帳外名單");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">日期</span>
          <Input
            type="date"
            className="w-44"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="text-sm text-muted-foreground">
          {closed ? closed : day ? `${dayLabel(day)}${date === hkTodayIso() ? " · 今日" : ""}` : "唔係上課日"}
        </div>
        <Button type="button" variant="outline" onClick={() => setDate(hkTodayIso())}>
          今日
        </Button>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary">外名單 {summary.roster}</Badge>
          <Badge variant={summary.open ? "destructive" : "secondary"}>未處理 {summary.open}</Badge>
          <Badge variant="outline">調堂 {summary.swaps}</Badge>
          <Badge variant="outline">代堂 {summary.covers}</Badge>
          {summary.leftover ? <Badge variant="destructive">未編 {summary.leftover}</Badge> : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4" />
            當日調堂及代堂安排
          </CardTitle>
          <CardDescription>已入帳嘅調出／調入同代堂；未編會一併列出。改日期即時更新。</CardDescription>
        </CardHeader>
        <CardContent>
          {!loaded ? (
            <p className="text-sm text-muted-foreground">載入紀錄中…</p>
          ) : lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">呢日未有已入帳嘅調堂或代堂。</p>
          ) : (
            <ul className="space-y-2">
              {lines.map((line) => (
                <ArrangementRow key={line.id} line={line} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">已知外名單</CardTitle>
          <CardDescription>
            人手輸入當日已知請假同事（姓名或簡稱，可一次過貼）。每位會顯示調堂／代堂已處理定未處理。名單存在呢部瀏覽器。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPasted();
                }
              }}
              placeholder="例如：振、華、伍卓鍵"
            />
            <Button type="button" onClick={addPasted}>
              加入外名單
            </Button>
            <Button type="button" variant="outline" onClick={importKnown}>
              帶入已入帳
            </Button>
            {roster.length ? (
              <Button type="button" variant="ghost" onClick={() => updateRoster([])}>
                清空名單
              </Button>
            ) : null}
          </div>

          <TeacherMultiPicker teachers={data.teachers} value={roster} onChange={updateRoster} />

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">未有外名單。輸入已知請假同事後會顯示處理進度。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>老師</TableHead>
                  <TableHead>調堂</TableHead>
                  <TableHead>代堂</TableHead>
                  <TableHead className="hidden md:table-cell">未處理節</TableHead>
                  <TableHead>前往</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.teacherId} className={row.overall === "open" ? "bg-amber-50/60" : undefined}>
                    <TableCell>
                      <div className="font-medium">
                        {row.teacherName}
                        <span className="ml-1 text-muted-foreground">（{row.teacherCode}）</span>
                      </div>
                      {row.leaveKindLabel ? (
                        <div className="text-xs text-muted-foreground">{row.leaveKindLabel}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.swap} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.cover} />
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {pendingText(row) || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Link
                          href={`/swap?teacher=${encodeURIComponent(row.teacherId)}&date=${date}`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          <ArrowLeftRight className="size-3.5" />
                          調堂
                        </Link>
                        <Link
                          href={`/cover?date=${date}&absentees=${encodeURIComponent(roster.join(","))}`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          <Repeat2 className="size-3.5" />
                          代堂
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function pendingText(row: DailyAbsenteeRow): string {
  const bits: string[] = [];
  if (row.swapLeftPeriods.length) bits.push(`調堂 ${row.swapLeftPeriods.map(periodLabel).join("、")}`);
  if (row.coverLeftPeriods.length) bits.push(`代堂 ${row.coverLeftPeriods.map(periodLabel).join("、")}`);
  return bits.join(" · ");
}

function StatusBadge({ status }: { status: HandleStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        status === "done" && "bg-emerald-100 text-emerald-950",
        status === "partial" && "bg-amber-100 text-amber-950",
        status === "none" && "bg-rose-100 text-rose-950",
        status === "na" && "bg-muted text-muted-foreground",
      )}
    >
      {handleStatusLabel(status)}
    </span>
  );
}

function ArrangementRow({ line }: { line: DailyArrangementLine }) {
  return (
    <li className="rounded-lg border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={line.kind === "leftover" ? "destructive" : line.kind === "cover" ? "default" : "secondary"}
        >
          {line.title}
        </Badge>
      </div>
      <p className="mt-1 text-muted-foreground">{line.detail}</p>
    </li>
  );
}
