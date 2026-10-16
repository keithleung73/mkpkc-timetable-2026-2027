"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dailyArrangementLines, dailySummary } from "@/lib/daily-board";
import { hkTodayIso, type SavedCoverPlan } from "@/lib/cover";
import type { ConfirmedSwap } from "@/lib/swap-records";
import { coverRequest } from "@/lib/web-ops";

export function TodayArrangementsCard() {
  const date = hkTodayIso();
  const [plans, setPlans] = useState<SavedCoverPlan[]>([]);
  const [swaps, setSwaps] = useState<ConfirmedSwap[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void coverRequest(null, undefined, "GET")
      .then((json) => {
        if (cancelled) return;
        const payload = json as { plans?: SavedCoverPlan[]; swaps?: ConfirmedSwap[] };
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

  const lines = useMemo(() => dailyArrangementLines(date, plans, swaps), [date, plans, swaps]);
  const summary = useMemo(() => dailySummary([], lines), [lines]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4" />
          今日調堂及代堂
        </CardTitle>
        <CardDescription>即時睇今日已入帳安排；亦可去當日代調頁人手輸入外名單。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!loaded ? (
          <p className="text-sm text-muted-foreground">載入紀錄中…</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">調堂 {summary.swaps}</Badge>
            <Badge variant="outline">代堂 {summary.covers}</Badge>
            {summary.leftover ? <Badge variant="destructive">未編 {summary.leftover}</Badge> : null}
            {lines.length === 0 ? (
              <span className="text-sm text-muted-foreground">今日未有已入帳安排。</span>
            ) : null}
          </div>
        )}
        {loaded && lines.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {lines.slice(0, 6).map((line) => (
              <li key={line.id}>
                <span className="font-medium">{line.title}</span>
                <span className="text-muted-foreground"> · {line.detail}</span>
              </li>
            ))}
            {lines.length > 6 ? (
              <li className="text-muted-foreground">仲有 {lines.length - 6} 項…</li>
            ) : null}
          </ul>
        ) : null}
        <Link href="/daily" className={buttonVariants({ variant: "outline", size: "sm" })}>
          開啟當日代調
        </Link>
      </CardContent>
    </Card>
  );
}
