"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { PageBody, PageHeader, ScheduleGate } from "@/components/page-chrome";
import { useSchedule } from "@/components/schedule-provider";
import { TeacherPicker } from "@/components/teacher-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { hkTodayIso, type SavedCoverPlan } from "@/lib/cover";
import { leaveKindLabel } from "@/lib/leave";
import { classNames } from "@/lib/queries";
import { coverRequest, swapRequest } from "@/lib/web-ops";
import type { ConfirmedSwap } from "@/lib/swap-records";
import {
  collectTeacherRecords,
  rangeFromPreset,
  rangeLabel,
  summarizeTeacherRecords,
  type RecordRangeKind,
  type TeacherRecordKind,
} from "@/lib/teacher-records";
import { downloadTeacherRecordsCsv, downloadTeacherRecordsXlsx } from "@/lib/teacher-records-export";
import { cn } from "@/lib/utils";

const RANGE_OPTIONS: { id: RecordRangeKind; label: string }[] = [
  { id: "day", label: "每日" },
  { id: "week", label: "每星期" },
  { id: "month", label: "每月" },
  { id: "custom", label: "自訂區間" },
];

const KIND_OPTIONS: { id: "all" | TeacherRecordKind; label: string }[] = [
  { id: "all", label: "調堂＋代堂" },
  { id: "swap", label: "只看調堂" },
  { id: "cover", label: "只看代堂" },
];

export default function TeacherRecordsPage() {
  return (
    <PageBody>
      <PageHeader
        title="代堂及調課記錄"
        description="查閱每位老師的代堂同調堂紀錄。可揀每日、每星期、每月，或自訂日期區間，再輸出 Excel／CSV 或列印。"
      />
      <ScheduleGate>
        <TeacherRecordsInner />
      </ScheduleGate>
    </PageBody>
  );
}

function TeacherRecordsInner() {
  const { data } = useSchedule();
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [rangeKind, setRangeKind] = useState<RecordRangeKind>("month");
  const [anchor, setAnchor] = useState(hkTodayIso());
  const [customStart, setCustomStart] = useState(hkTodayIso());
  const [customEnd, setCustomEnd] = useState(hkTodayIso());
  const [kind, setKind] = useState<"all" | TeacherRecordKind>("all");
  const [swaps, setSwaps] = useState<ConfirmedSwap[]>([]);
  const [plans, setPlans] = useState<SavedCoverPlan[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([swapRequest(null, undefined, "GET"), coverRequest(null, undefined, "GET")])
      .then(([swapJson, coverJson]) => {
        if (cancelled) return;
        setSwaps((swapJson as { swaps?: ConfirmedSwap[] }).swaps ?? []);
        setPlans((coverJson as { plans?: SavedCoverPlan[] }).plans ?? []);
        setLoaded(true);
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "載入紀錄失敗");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const range = useMemo(
    () => rangeFromPreset(rangeKind, anchor, customStart, customEnd),
    [rangeKind, anchor, customStart, customEnd],
  );
  const teacher = data?.teachers.find((t) => t.id === teacherId) ?? null;
  const rows = useMemo(
    () => collectTeacherRecords(swaps, plans, teacherId, range, kind),
    [swaps, plans, teacherId, range, kind],
  );
  const summary = useMemo(() => summarizeTeacherRecords(rows), [rows]);

  if (!data) return null;

  const title = `${teacher ? teacher.name : "全部老師"} · ${rangeLabel(rangeKind, range)}`;

  const exportXlsx = () => {
    if (rows.length === 0) {
      toast.error("呢個區間無紀錄可輸出");
      return;
    }
    downloadTeacherRecordsXlsx(rows, teacher?.name ?? null, range, title);
    toast.success("已下載 Excel");
  };

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.error("呢個區間無紀錄可輸出");
      return;
    }
    downloadTeacherRecordsCsv(rows, teacher?.name ?? null, range);
    toast.success("已下載 CSV");
  };

  return (
    <div className="space-y-6 print:space-y-3">
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="size-4" />
            查閱條件
          </CardTitle>
          <CardDescription>
            留空老師即睇全部同事。區間內只要該老師有份調堂或代堂（請假／對手／代人）都會列出。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">老師</span>
              <TeacherPicker
                teachers={data.teachers}
                value={teacherId}
                onChange={setTeacherId}
                placeholder="搜尋老師，或留空睇全部"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setTeacherId(null)}>
                  全部老師
                </Button>
                {teacher ? (
                  <span className="self-center text-xs text-muted-foreground">
                    已選：{teacher.name}（{teacher.code}）
                  </span>
                ) : (
                  <span className="self-center text-xs text-muted-foreground">而家睇全部老師</span>
                )}
              </div>
            </label>

            <div className="grid gap-2 text-sm">
              <span className="text-muted-foreground">區間</span>
              <div className="flex flex-wrap gap-2">
                {RANGE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.id}
                    type="button"
                    size="sm"
                    variant={rangeKind === opt.id ? "default" : "outline"}
                    onClick={() => setRangeKind(opt.id)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
              {rangeKind === "custom" ? (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="grid gap-1">
                    <span className="text-xs text-muted-foreground">由</span>
                    <Input
                      type="date"
                      className="w-44"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs text-muted-foreground">至</span>
                    <Input
                      type="date"
                      className="w-44"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                    />
                  </label>
                </div>
              ) : (
                <label className="grid max-w-xs gap-1">
                  <span className="text-xs text-muted-foreground">
                    {rangeKind === "day" ? "日期" : rangeKind === "week" ? "該星期內任何一日" : "該月內任何一日"}
                  </span>
                  <Input
                    type={rangeKind === "month" ? "month" : "date"}
                    value={rangeKind === "month" ? anchor.slice(0, 7) : anchor}
                    onChange={(e) => {
                      const v = e.target.value;
                      setAnchor(v.length === 7 ? `${v}-01` : v);
                    }}
                  />
                </label>
              )}
              <p className="text-xs text-muted-foreground">{rangeLabel(rangeKind, range)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {KIND_OPTIONS.map((opt) => (
              <Button
                key={opt.id}
                type="button"
                size="sm"
                variant={kind === opt.id ? "default" : "outline"}
                onClick={() => setKind(opt.id)}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={exportXlsx} disabled={!loaded || rows.length === 0}>
              <Download />
              輸出 Excel
            </Button>
            <Button type="button" variant="outline" onClick={exportCsv} disabled={!loaded || rows.length === 0}>
              <Download />
              輸出 CSV
            </Button>
            <Button type="button" variant="outline" onClick={() => window.print()} disabled={rows.length === 0}>
              <Printer />
              列印
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-sm print:gap-1">
        <Badge>{title}</Badge>
        <Badge variant="outline">合共 {summary.total} 項</Badge>
        <Badge variant="outline">調堂 {summary.swap}</Badge>
        <Badge variant="outline">代堂 {summary.cover}</Badge>
        <Badge variant="outline">請假被代 {summary.absentee}</Badge>
        <Badge variant="outline">代人上堂 {summary.covering}</Badge>
        {summary.uncovered > 0 ? <Badge variant="outline">未編配 {summary.uncovered}</Badge> : null}
      </div>

      <Card>
        <CardHeader className="print:pb-2">
          <CardTitle className="text-base">紀錄一覽</CardTitle>
          <CardDescription className="print:hidden">
            {loaded ? "按日期、節次排列。同一調堂若跨兩日，請假同對手兩邊日子都會列出。" : "正在載入已確認紀錄…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {loaded ? "呢個區間無代堂或調堂紀錄。" : "載入中…"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {!teacherId ? <TableHead>老師</TableHead> : null}
                  <TableHead>日期</TableHead>
                  <TableHead>種類</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>節次</TableHead>
                  <TableHead>科目</TableHead>
                  <TableHead>班</TableHead>
                  <TableHead>對手</TableHead>
                  <TableHead>說明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    {!teacherId ? <TableCell>{r.teacherName}</TableCell> : null}
                    <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                    <TableCell>
                      <Badge variant={r.kind === "swap" ? "default" : "secondary"}>
                        {r.kind === "swap" ? "調堂" : "代堂"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.roleLabel}
                      {r.leaveKind ? (
                        <span className="block text-xs text-muted-foreground">{leaveKindLabel(r.leaveKind)}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{r.periodText}</TableCell>
                    <TableCell>{r.subjects.join("、")}</TableCell>
                    <TableCell>{classNames(data, r.classIds)}</TableCell>
                    <TableCell>{r.counterpartName}</TableCell>
                    <TableCell className={cn("max-w-xs whitespace-normal text-muted-foreground")}>
                      {r.detail}
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
