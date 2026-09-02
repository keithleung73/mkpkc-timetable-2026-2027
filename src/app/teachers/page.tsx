"use client";

import { useMemo, useState } from "react";
import { PageBody, PageHeader, ScheduleGate } from "@/components/page-chrome";
import { TeacherPicker } from "@/components/teacher-picker";
import { TimetableGrid } from "@/components/timetable-grid";
import { useSchedule } from "@/components/schedule-provider";
import { Badge } from "@/components/ui/badge";
import { lessonsOfTeacher, weeklyLoad } from "@/lib/queries";
import { DAYS } from "@/lib/constants";

export default function TeachersPage() {
  return (
    <PageBody>
      <PageHeader
        title="老師時間表"
        description="用中文姓名、英文姓氏（例如 Tang＝鄧、Chan＝陳）或學務部簡稱搜尋，查看該老師一週每節班別、科目同地點。"
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
  const teacher = data?.teachers.find((t) => t.id === id);
  const lessons = useMemo(
    () => (data && id ? lessonsOfTeacher(data, id) : []),
    [data, id],
  );

  if (!data) return null;

  return (
    <div className="space-y-5">
      <TeacherPicker teachers={data.teachers} value={id} onChange={setId} />
      {!teacher ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          請選擇老師。可輸入「華」「真」、英文姓氏「Tang」「Chan」，或 ROIS。
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">
              {teacher.name}（{teacher.code}）
            </h3>
            {teacher.englishName ? (
              <span className="text-sm text-muted-foreground">{teacher.englishName}</span>
            ) : null}
            <Badge variant="secondary">{teacher.subjects.join("、")}</Badge>
            <Badge>每週 {weeklyLoad(data, teacher.id)} 節</Badge>
            {DAYS.map((d) => {
              const n = lessons.filter((l) => l.day === d.id).length;
              return (
                <Badge key={d.id} variant="outline">
                  {d.short} {n}
                </Badge>
              );
            })}
          </div>
          {lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">此老師未有課堂紀錄。</p>
          ) : (
            <TimetableGrid data={data} lessons={lessons} emptyLabel="空閒" />
          )}
        </>
      )}
    </div>
  );
}
