"use client";

import { DAYS, LESSON_PERIODS, ALL_TEACHING_PERIODS, formatTimeRange } from "@/lib/constants";
import type { DayId } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function DaySelect({
  value,
  onChange,
}: {
  value: DayId;
  onChange: (d: DayId) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => { if (v) onChange(v as DayId); }}>
      <SelectTrigger className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DAYS.map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PeriodSelect({
  day,
  value,
  onChange,
}: {
  day: DayId;
  value: string;
  onChange: (p: string) => void;
}) {
  const periods = day === "fri" ? LESSON_PERIODS : ALL_TEACHING_PERIODS;
  return (
    <Select value={value} onValueChange={(v) => { if (v) onChange(v); }}>
      <SelectTrigger className="w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {periods.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.label}（{formatTimeRange(day, p.id)}）
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
