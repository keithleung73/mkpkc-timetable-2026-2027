"use client";

import { useMemo, useState } from "react";
import { PageBody, PageHeader, ScheduleGate } from "@/components/page-chrome";
import { TeacherPicker } from "@/components/teacher-picker";
import { DaySelect, PeriodSelect } from "@/components/day-period-select";
import { useSchedule } from "@/components/schedule-provider";
import type { DayId } from "@/lib/types";
import { currentDay, currentPeriodId, isTeachingPeriod } from "@/lib/clock";
import { dayLabel, formatTimeRange, periodLabel } from "@/lib/constants";
import { classNames, lessonAt, roomName, teacherLessonCountOnDay, teacherNames } from "@/lib/queries";
import { Button } from "@/components/ui/button";

export default function StatusPage() {
  return (
    <PageBody>
      <PageHeader
        title="課堂狀態（地點）"
        description="查詢某位老師喺指定星期、節次係上課定空閒；上課會顯示班別、科目同課室。"
      />
      <ScheduleGate>
        <Inner />
      </ScheduleGate>
    </PageBody>
  );
}

function Inner() {
  const { data } = useSchedule();
  const [id, setId] = useState<string | null>(null);
  const [day, setDay] = useState<DayId>(currentDay() ?? "mon");
  const initialPeriod = currentPeriodId();
  const [periodId, setPeriodId] = useState(
    isTeachingPeriod(initialPeriod) ? initialPeriod : "p1",
  );

  const lesson = useMemo(() => {
    if (!data || !id) return undefined;
    return lessonAt(data, day, periodId, { teacherId: id });
  }, [data, id, day, periodId]);

  if (!data) return null;
  const teacher = data.teachers.find((t) => t.id === id);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <TeacherPicker teachers={data.teachers} value={id} onChange={setId} />
        <DaySelect value={day} onChange={setDay} />
        <PeriodSelect day={day} value={periodId} onChange={setPeriodId} />
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

      {!teacher ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          請先揀老師。
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            {teacher.name}（{teacher.code}）· {dayLabel(day)} {periodLabel(periodId)}{" "}
            {formatTimeRange(day, periodId)} · 當日已有{" "}
            {teacherLessonCountOnDay(data, teacher.id, day)} 節
          </p>
          {lesson ? (
            <div className="mt-4 space-y-1">
              <p className="text-2xl font-semibold">上課中</p>
              <p className="text-lg">
                {lesson.subject} · {classNames(data, lesson.classIds)}
              </p>
              <p className="text-muted-foreground">地點：{roomName(data, lesson.roomId)}</p>
              <p className="text-muted-foreground">老師：{teacherNames(data, lesson.teacherIds)}</p>
              {lesson.note ? <p className="text-sm">{lesson.note}</p> : null}
            </div>
          ) : (
            <div className="mt-4 space-y-1">
              <p className="text-2xl font-semibold text-emerald-700">空閒</p>
              <p className="text-muted-foreground">此節無課堂，可考慮編配代課或會議。</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
