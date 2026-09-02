"use client";

import type { DayId, Lesson, ScheduleData } from "@/lib/types";
import {
  ALL_TEACHING_PERIODS,
  DAYS,
  formatTimeRange,
  LESSON_PERIODS,
  periodLabel,
  subjectClass,
} from "@/lib/constants";
import { classNames, roomName, teacherNames } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function TimetableGrid({
  data,
  lessons,
  highlight,
  emptyLabel = "空堂",
  showFridayP9 = false,
}: {
  data: ScheduleData;
  lessons: Lesson[];
  highlight?: { day: DayId; periodId: string };
  emptyLabel?: string;
  showFridayP9?: boolean;
}) {
  const periods = showFridayP9 ? ALL_TEACHING_PERIODS : [...LESSON_PERIODS, ...ALL_TEACHING_PERIODS.filter((p) => p.id === "p9")];
  const uniquePeriods = periods.filter(
    (p, i, arr) => arr.findIndex((x) => x.id === p.id) === i,
  );

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="bg-[color:var(--school-navy)] text-white">
            <th className="w-28 px-3 py-2 text-left font-medium">節次</th>
            {DAYS.map((d) => (
              <th key={d.id} className="px-2 py-2 text-left font-medium">
                {d.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {uniquePeriods.map((p) => (
            <tr key={p.id} className="border-t">
              <th className="bg-muted/60 px-3 py-2 text-left align-top font-medium">
                <div>{p.label}</div>
                <div className="text-[11px] font-normal text-muted-foreground">
                  {formatTimeRange("mon", p.id)}
                  {p.id !== "p9" ? (
                    <span className="block">五 {formatTimeRange("fri", p.id)}</span>
                  ) : null}
                </div>
              </th>
              {DAYS.map((d) => {
                if ((p.id === "p9" || p.id === "p10") && d.id === "fri") {
                  return (
                    <td key={d.id} className="bg-muted/30 px-2 py-2 align-top text-muted-foreground">
                      {p.id === "p9" ? "全人教育時段" : ""}
                    </td>
                  );
                }
                const cellLessons = lessons.filter((l) => l.day === d.id && l.periodId === p.id);
                const active = highlight?.day === d.id && highlight?.periodId === p.id;
                return (
                  <td
                    key={d.id}
                    className={cn("px-1.5 py-1.5 align-top", active && "bg-amber-50")}
                  >
                    {cellLessons.length === 0 ? (
                      <div className="rounded-md border border-dashed px-2 py-2 text-xs text-muted-foreground">
                        {emptyLabel}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {cellLessons.map((l) => (
                          <div
                            key={l.id}
                            className={cn(
                              "rounded-md border px-2 py-1.5",
                              subjectClass(l.subject.split("／")[0] ?? l.subject),
                            )}
                          >
                            <div className="font-medium">{l.subject}</div>
                            <div className="text-[11px] opacity-80">
                              {[l.classIds.length ? classNames(data, l.classIds) : null, l.roomId ? roomName(data, l.roomId) : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                            {l.kind !== "meeting" ? (
                            <div className="text-[11px] opacity-80">
                              {teacherNames(data, l.teacherIds)}
                            </div>
                            ) : null}
                            {l.note ? <div className="text-[11px] opacity-70">{l.note}</div> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LessonLine({
  data,
  lesson,
}: {
  data: ScheduleData;
  lesson: Lesson;
}) {
  return (
    <div className={cn("rounded-lg border px-3 py-2", subjectClass(lesson.subject.split("／")[0] ?? lesson.subject))}>
      <div className="font-medium">
        {periodLabel(lesson.periodId)} · {lesson.subject}
      </div>
      <div className="text-sm opacity-80">
        {classNames(data, lesson.classIds)} · {roomName(data, lesson.roomId)} · {teacherNames(data, lesson.teacherIds)}
      </div>
    </div>
  );
}
