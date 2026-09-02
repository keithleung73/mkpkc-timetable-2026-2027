"use client";

import { useMemo, useState } from "react";
import { PageBody, PageHeader, ScheduleGate } from "@/components/page-chrome";
import { TimetableGrid } from "@/components/timetable-grid";
import { useSchedule } from "@/components/schedule-provider";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { lessonsOfClass, teacherNames } from "@/lib/queries";
import { cn } from "@/lib/utils";

export default function ClassesPage() {
  return (
    <PageBody>
      <PageHeader
        title="班別課堂與地點"
        description="查 1A–6E 每節科目、老師同上課地點。高中班會顯示選修組合。"
      />
      <ScheduleGate>
        <Inner />
      </ScheduleGate>
    </PageBody>
  );
}

function Inner() {
  const { data } = useSchedule();
  const [form, setForm] = useState<number>(1);
  const [q, setQ] = useState("");
  const [id, setId] = useState("1A");

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.classes.filter((c) => {
      if (c.form !== form) return false;
      if (!q.trim()) return true;
      return c.name.toLowerCase().includes(q.trim().toLowerCase());
    });
  }, [data, form, q]);

  const cls = data?.classes.find((c) => c.id === id);
  const lessons = data && cls ? lessonsOfClass(data, cls.id) : [];

  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setForm(f);
              const first = data.classes.find((c) => c.form === f);
              if (first) setId(first.id);
            }}
            className={cn(
              "rounded-full px-3 py-1 text-sm",
              form === f
                ? "bg-[color:var(--school-navy)] text-white"
                : "bg-muted text-muted-foreground",
            )}
          >
            中{["一", "二", "三", "四", "五", "六"][f - 1]}
          </button>
        ))}
        <Input
          className="w-40"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="篩選班別"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">冇符合嘅班別。</p>
        ) : (
          filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setId(c.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm",
                id === c.id
                  ? "border-[color:var(--school-navy)] bg-[color:var(--school-navy)] text-white"
                  : "hover:bg-muted",
              )}
            >
              {c.name}
            </button>
          ))
        )}
      </div>

      {!cls ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          請選擇班別。
        </div>
      ) : lessons.length === 0 ? (
        <p className="text-sm text-muted-foreground">{cls.name} 未有課堂紀錄。</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{cls.name}</h3>
            <Badge variant="secondary">課室 {cls.homeRoom}室</Badge>
            <Badge variant="outline">
              班主任 {teacherNames(data, cls.classTeacherIds)}
            </Badge>
            {cls.stream ? <Badge>{cls.stream}</Badge> : null}
            <Badge variant="outline">每週 {lessons.length} 節</Badge>
          </div>
          <TimetableGrid data={data} lessons={lessons} />
        </div>
      )}
    </div>
  );
}
