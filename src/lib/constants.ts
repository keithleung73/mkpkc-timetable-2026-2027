import type { DayId, PeriodDef, PeriodTime } from "./types";

export const SCHOOL_NAME = "萬鈞伯裘書院";
export const SCHOOL_NAME_EN = "Man Kwan Pak Kau College";
export const SCHOOL_YEAR = "2026-2027";

export const DAYS: { id: DayId; label: string; short: string }[] = [
  { id: "mon", label: "星期一", short: "一" },
  { id: "tue", label: "星期二", short: "二" },
  { id: "wed", label: "星期三", short: "三" },
  { id: "thu", label: "星期四", short: "四" },
  { id: "fri", label: "星期五", short: "五" },
];

export const LESSON_PERIODS: PeriodDef[] = [
  { id: "p1", label: "第一節", kind: "lesson" },
  { id: "p2", label: "第二節", kind: "lesson" },
  { id: "p3", label: "第三節", kind: "lesson" },
  { id: "p4", label: "第四節", kind: "lesson" },
  { id: "p5", label: "第五節", kind: "lesson" },
  { id: "p6", label: "第六節", kind: "lesson" },
  { id: "p7", label: "第七節", kind: "lesson" },
  { id: "p8", label: "第八節", kind: "lesson" },
];

export const EXTRA_PERIODS: PeriodDef[] = [
  { id: "p9", label: "重摘課／自主學習", kind: "other" },
  { id: "p10", label: "課後", kind: "other" },
];

export const ALL_TEACHING_PERIODS = [...LESSON_PERIODS, ...EXTRA_PERIODS];

/** 可編代堂嘅節次（課後 p10 同會議唔代）。星期五一般無 p9。 */
export const COVER_PERIOD_IDS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"] as const;

export const MON_THU_TIMES: Record<string, PeriodTime> = {
  assembly: { start: "08:00", end: "08:25" },
  p1: { start: "08:25", end: "09:00" },
  p2: { start: "09:00", end: "09:35" },
  review1: { start: "09:35", end: "09:45" },
  recess1: { start: "09:45", end: "10:05" },
  p3: { start: "10:05", end: "10:40" },
  p4: { start: "10:40", end: "11:15" },
  review2: { start: "11:15", end: "11:25" },
  recess2: { start: "11:25", end: "11:40" },
  p5: { start: "11:40", end: "12:15" },
  p6: { start: "12:15", end: "12:50" },
  review3: { start: "12:50", end: "13:00" },
  lunch: { start: "13:00", end: "14:05" },
  p7: { start: "14:05", end: "14:40" },
  p8: { start: "14:40", end: "15:15" },
  p9: { start: "15:15", end: "15:50" },
  p10: { start: "15:50", end: "16:25" },
};

export const FRI_TIMES: Record<string, PeriodTime> = {
  assembly: { start: "08:00", end: "08:15" },
  p1: { start: "08:15", end: "08:45" },
  p2: { start: "08:45", end: "09:15" },
  recess1: { start: "09:15", end: "09:35" },
  p3: { start: "09:35", end: "10:05" },
  p4: { start: "10:05", end: "10:35" },
  recess2: { start: "10:35", end: "10:50" },
  p5: { start: "10:50", end: "11:20" },
  p6: { start: "11:20", end: "11:50" },
  recess3: { start: "11:50", end: "12:00" },
  p7: { start: "12:00", end: "12:30" },
  p8: { start: "12:30", end: "13:00" },
  lunch: { start: "13:00", end: "14:05" },
  wholeperson: { start: "14:05", end: "15:40" },
  classTeacher: { start: "15:40", end: "15:50" },
};

export function periodTime(day: DayId, periodId: string): PeriodTime | undefined {
  const table = day === "fri" ? FRI_TIMES : MON_THU_TIMES;
  return table[periodId];
}

export function formatTimeRange(day: DayId, periodId: string): string {
  const t = periodTime(day, periodId);
  if (!t) return "";
  return `${t.start}–${t.end}`;
}

export const SUBJECT_COLORS: Record<string, string> = {
  中國語文: "bg-rose-100 text-rose-900 border-rose-200",
  英國語文: "bg-sky-100 text-sky-900 border-sky-200",
  數學: "bg-indigo-100 text-indigo-900 border-indigo-200",
  歷史: "bg-amber-100 text-amber-950 border-amber-200",
  中國歷史: "bg-orange-100 text-orange-950 border-orange-200",
  地理: "bg-emerald-100 text-emerald-950 border-emerald-200",
  公民經濟與社會: "bg-teal-100 text-teal-950 border-teal-200",
  公民與社會發展: "bg-teal-100 text-teal-950 border-teal-200",
  科學: "bg-lime-100 text-lime-950 border-lime-200",
  物理: "bg-cyan-100 text-cyan-950 border-cyan-200",
  化學: "bg-violet-100 text-violet-950 border-violet-200",
  生物: "bg-green-100 text-green-950 border-green-200",
  電腦: "bg-slate-100 text-slate-900 border-slate-200",
  資訊及通訊科技: "bg-slate-100 text-slate-900 border-slate-200",
  普通話: "bg-pink-100 text-pink-950 border-pink-200",
  視覺藝術: "bg-fuchsia-100 text-fuchsia-950 border-fuchsia-200",
  音樂: "bg-purple-100 text-purple-950 border-purple-200",
  戲劇: "bg-red-100 text-red-950 border-red-200",
  體育: "bg-yellow-100 text-yellow-950 border-yellow-200",
  LCL: "bg-stone-100 text-stone-900 border-stone-200",
  深度閱讀: "bg-orange-50 text-orange-900 border-orange-200",
  英文會話: "bg-blue-50 text-blue-900 border-blue-200",
  經濟: "bg-yellow-50 text-yellow-950 border-yellow-200",
  企會財: "bg-neutral-100 text-neutral-900 border-neutral-200",
  應用學習: "bg-zinc-100 text-zinc-900 border-zinc-200",
  數學延伸M1: "bg-indigo-50 text-indigo-950 border-indigo-200",
  全人教育: "bg-red-50 text-red-900 border-red-200",
};

export const SUBJECT_ABBR: Record<string, string> = {
  中國語文: "中",
  英國語文: "英",
  數學: "數",
  歷史: "歷",
  中國歷史: "中史",
  地理: "地",
  公民經濟與社會: "生社",
  公民與社會發展: "公民",
  科學: "科",
  物理: "物",
  化學: "化",
  生物: "生",
  電腦: "電",
  資訊及通訊科技: "資",
  普通話: "普",
  視覺藝術: "視",
  音樂: "音",
  戲劇: "戲",
  體育: "體",
  LCL: "LCL",
  深度閱讀: "閱",
  英文會話: "話",
  經濟: "經",
  企會財: "企",
  應用學習: "應",
  數學延伸M1: "M1",
  全人教育: "全人",
};

export const ABBR_TO_SUBJECT: Record<string, string> = Object.fromEntries(
  Object.entries(SUBJECT_ABBR).map(([k, v]) => [v, k]),
);

export function subjectClass(subject: string): string {
  return SUBJECT_COLORS[subject] ?? "bg-muted text-foreground border-border";
}

export function dayLabel(day: DayId): string {
  return DAYS.find((d) => d.id === day)?.label ?? day;
}

export function periodLabel(periodId: string): string {
  return ALL_TEACHING_PERIODS.find((p) => p.id === periodId)?.label ?? periodId;
}
