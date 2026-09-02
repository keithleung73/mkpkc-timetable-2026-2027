"use client";

import { useMemo, useState } from "react";
import { PageBody, PageHeader, ScheduleGate } from "@/components/page-chrome";
import { DaySelect, PeriodSelect } from "@/components/day-period-select";
import { useSchedule } from "@/components/schedule-provider";
import type { DayId } from "@/lib/types";
import { currentDay, currentPeriodId, isTeachingPeriod } from "@/lib/clock";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { substituteCandidates } from "@/lib/queries";
import { filterTeachers } from "@/lib/search";
import { dayLabel, formatTimeRange, periodLabel } from "@/lib/constants";

export default function FreePage() {
  return (
    <PageBody>
      <PageHeader
        title="該時段空閒老師"
        description="列出指定星期、節次無課嘅老師。排序跟《成裘集》代課原則：當日少於 7 節、有任教該班、同科老師優先。"
      />
      <ScheduleGate>
        <Inner />
      </ScheduleGate>
    </PageBody>
  );
}

function Inner() {
  const { data } = useSchedule();
  const [day, setDay] = useState<DayId>(currentDay() ?? "mon");
  const initialPeriod = currentPeriodId();
  const [periodId, setPeriodId] = useState(
    isTeachingPeriod(initialPeriod) ? initialPeriod : "p1",
  );
  const [classId, setClassId] = useState<string>("all");
  const [subject, setSubject] = useState("");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    if (!data) return [];
    const list = substituteCandidates(data, day, periodId, {
      classId: classId === "all" ? undefined : classId,
      subject: subject || undefined,
    });
    if (!q.trim()) return list;
    const keep = new Set(filterTeachers(list.map((r) => r.teacher), q).map((t) => t.id));
    return list.filter((r) => keep.has(r.teacher.id));
  }, [data, day, periodId, classId, subject, q]);

  if (!data) return null;
  const subjects = Array.from(new Set(data.teachers.flatMap((t) => t.subjects))).sort();

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <DaySelect value={day} onChange={setDay} />
        <PeriodSelect day={day} value={periodId} onChange={setPeriodId} />
        <Select value={classId} onValueChange={(v) => { if (v) setClassId(v); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="班別" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">唔限班別</SelectItem>
            {data.classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={subject || "all"} onValueChange={(v) => { if (v) setSubject(v === "all" ? "" : v); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="科目" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">唔限科目</SelectItem>
            {subjects.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="md:w-56"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="篩選姓名／簡稱／英文"
        />
        <Button
          variant="outline"
          onClick={() => {
            const d = currentDay();
            const p = currentPeriodId();
            if (d) setDay(d);
            if (isTeachingPeriod(p)) setPeriodId(p);
          }}
        >
          用而家呢一節
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {dayLabel(day)} {periodLabel(periodId)} {formatTimeRange(day, periodId)} · 共 {rows.length} 位空閒
      </p>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          呢一節冇空閒老師，或篩選條件太窄。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">老師</th>
                <th className="px-3 py-2 font-medium">科目</th>
                <th className="px-3 py-2 font-medium">當日節數</th>
                <th className="px-3 py-2 font-medium">每週節數</th>
                <th className="px-3 py-2 font-medium">代課優先</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.teacher.id} className="border-t">
                  <td className="px-3 py-2">
                    {r.teacher.name}（{r.teacher.code}）
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.teacher.subjects.join("、")}</td>
                  <td className="px-3 py-2">{r.lessonsToday}</td>
                  <td className="px-3 py-2">{r.weekly}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.underSeven ? <Badge>少於7節</Badge> : null}
                      {r.teachesClass ? <Badge variant="secondary">任教該班</Badge> : null}
                      {r.sameSubject ? <Badge variant="outline">同科</Badge> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
