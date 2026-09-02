"use client";

import { useMemo, useState } from "react";
import { PageBody, PageHeader, ScheduleGate } from "@/components/page-chrome";
import { TeacherMultiPicker } from "@/components/teacher-picker";
import { useSchedule } from "@/components/schedule-provider";
import { commonFreeSlots } from "@/lib/queries";
import { DAYS, dayLabel, formatTimeRange, periodLabel } from "@/lib/constants";

export default function CommonFreePage() {
  return (
    <PageBody>
      <PageHeader
        title="共同空閒時段"
        description="揀一組老師，計出所有人都得閒嘅節次，方便學務會議、調堂或共同備課。"
      />
      <ScheduleGate>
        <Inner />
      </ScheduleGate>
    </PageBody>
  );
}

function Inner() {
  const { data } = useSchedule();
  const [ids, setIds] = useState<string[]>([]);
  const slots = useMemo(
    () => (data ? commonFreeSlots(data, ids) : []),
    [data, ids],
  );

  if (!data) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
      <div>
        <TeacherMultiPicker teachers={data.teachers} value={ids} onChange={setIds} />
      </div>
      <div>
        {ids.length < 2 ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            請至少選兩位老師。
          </div>
        ) : slots.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            選定嘅 {ids.length} 位老師冇共同空閒節。
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              已選 {ids.length} 人 · 共同空閒 {slots.length} 節
            </p>
            {DAYS.map((d) => {
              const daySlots = slots.filter((s) => s.day === d.id);
              if (daySlots.length === 0) return null;
              return (
                <div key={d.id} className="rounded-xl border">
                  <div className="border-b bg-muted/50 px-4 py-2 font-medium">{dayLabel(d.id)}</div>
                  <ul className="divide-y">
                    {daySlots.map((s) => (
                      <li key={`${s.day}-${s.periodId}`} className="px-4 py-2 text-sm">
                        {periodLabel(s.periodId)}
                        <span className="ml-2 text-muted-foreground">
                          {formatTimeRange(s.day, s.periodId)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
