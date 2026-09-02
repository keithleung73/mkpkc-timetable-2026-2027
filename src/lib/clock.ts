import type { DayId } from "./types";
import { FRI_TIMES, MON_THU_TIMES, periodTime } from "./constants";

const TZ = "Asia/Hong_Kong";

function partsInHk(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return { weekday: map.weekday, hour: Number(map.hour), minute: Number(map.minute) };
}

export function currentDay(date = new Date()): DayId | null {
  const w = partsInHk(date).weekday;
  const map: Record<string, DayId> = {
    Mon: "mon",
    Tue: "tue",
    Wed: "wed",
    Thu: "thu",
    Fri: "fri",
  };
  return map[w] ?? null;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function currentPeriodId(date = new Date()): string | null {
  const day = currentDay(date);
  if (!day) return null;
  const { hour, minute } = partsInHk(date);
  const now = hour * 60 + minute;
  const table = day === "fri" ? FRI_TIMES : MON_THU_TIMES;
  for (const [id, t] of Object.entries(table)) {
    if (now >= toMinutes(t.start) && now < toMinutes(t.end)) return id;
  }
  return null;
}

export function isTeachingPeriod(periodId: string | null): periodId is string {
  return Boolean(periodId && /^p[1-9]$/.test(periodId));
}

export { periodTime };
