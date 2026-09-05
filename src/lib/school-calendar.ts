import { weekdayFromIsoDate } from "./cover";

/**
 * 萬鈞伯裘書院 2026–2027 年度校曆表（學生）（第 11 稿，2026-6-1）。
 * 學校假期、統測、考試、深度學習周沒有正規課堂，不能調堂亦不能代堂。
 */
export const SCHOOL_CALENDAR_SOURCE =
  "萬鈞伯裘書院 2026-2027 年度校曆表（第 11 稿，2026-6-1）";

export type CalendarKind =
  | "holiday"
  | "no_class"
  | "teacher_pd"
  | "assessment"
  | "exam"
  | "dlw";

export type CalendarEvent = {
  start: string;
  end: string;
  kind: CalendarKind;
  label: string;
  /** 無正規課堂（假期、統測、考試、深度學習周、陸運會、開放日、教師發展日等） */
  closesSchool: boolean;
};

export const SCHOOL_CALENDAR: CalendarEvent[] = [
  { start: "2026-09-26", end: "2026-09-26", kind: "holiday", label: "中秋節翌日", closesSchool: true },
  { start: "2026-09-28", end: "2026-09-29", kind: "no_class", label: "陸運會", closesSchool: true },
  { start: "2026-09-30", end: "2026-09-30", kind: "holiday", label: "陸運會後假期", closesSchool: true },
  { start: "2026-10-01", end: "2026-10-01", kind: "holiday", label: "國慶日", closesSchool: true },
  { start: "2026-10-02", end: "2026-10-02", kind: "holiday", label: "國慶日後假期", closesSchool: true },
  {
    start: "2026-10-09",
    end: "2026-10-09",
    kind: "teacher_pd",
    label: "教師專業發展日（學生不用上課）",
    closesSchool: true,
  },
  { start: "2026-10-19", end: "2026-10-19", kind: "holiday", label: "重陽節翌日", closesSchool: true },
  {
    start: "2026-10-27",
    end: "2026-10-30",
    kind: "assessment",
    label: "第一次統測（中四至中六）",
    closesSchool: true,
  },
  {
    start: "2026-10-27",
    end: "2026-10-30",
    kind: "dlw",
    label: "深度學習周（Deep Learning Week）",
    closesSchool: true,
  },
  { start: "2026-11-20", end: "2026-11-20", kind: "no_class", label: "全校旅行", closesSchool: true },
  { start: "2026-12-04", end: "2026-12-05", kind: "no_class", label: "學校開放日", closesSchool: true },
  { start: "2026-12-07", end: "2026-12-07", kind: "holiday", label: "開放日後假期", closesSchool: true },
  {
    start: "2026-12-08",
    end: "2026-12-11",
    kind: "dlw",
    label: "深度學習周（Deep Learning Week）",
    closesSchool: true,
  },
  {
    start: "2026-12-23",
    end: "2027-01-02",
    kind: "holiday",
    label: "聖誕節及新年假期",
    closesSchool: true,
  },
  {
    start: "2027-01-07",
    end: "2027-01-20",
    kind: "exam",
    label: "第一次考試／中六畢業考試",
    closesSchool: true,
  },
  { start: "2027-02-04", end: "2027-02-16", kind: "holiday", label: "農曆新年假期", closesSchool: true },
  {
    start: "2027-02-17",
    end: "2027-02-17",
    kind: "teacher_pd",
    label: "教師專業發展日（學生不用上課）",
    closesSchool: true,
  },
  { start: "2027-02-28", end: "2027-02-28", kind: "no_class", label: "家長日", closesSchool: true },
  { start: "2027-03-01", end: "2027-03-01", kind: "holiday", label: "家長日後假期", closesSchool: true },
  { start: "2027-03-04", end: "2027-03-04", kind: "no_class", label: "聯校陸運會", closesSchool: true },
  {
    start: "2027-03-05",
    end: "2027-03-05",
    kind: "holiday",
    label: "聯校陸運會後假期",
    closesSchool: true,
  },
  { start: "2027-03-22", end: "2027-03-29", kind: "holiday", label: "復活節假期", closesSchool: true },
  { start: "2027-04-05", end: "2027-04-05", kind: "holiday", label: "清明節", closesSchool: true },
  {
    start: "2027-04-06",
    end: "2027-04-09",
    kind: "assessment",
    label: "第二次統測（中四至中五）",
    closesSchool: true,
  },
  { start: "2027-05-01", end: "2027-05-01", kind: "holiday", label: "勞動節", closesSchool: true },
  {
    start: "2027-05-03",
    end: "2027-05-07",
    kind: "dlw",
    label: "深度學習周（環球自主學習週）",
    closesSchool: true,
  },
  { start: "2027-05-13", end: "2027-05-13", kind: "holiday", label: "佛誕", closesSchool: true },
  { start: "2027-05-27", end: "2027-05-27", kind: "no_class", label: "畢業典禮", closesSchool: true },
  {
    start: "2027-05-28",
    end: "2027-05-28",
    kind: "holiday",
    label: "畢業典禮後假期",
    closesSchool: true,
  },
  { start: "2027-06-09", end: "2027-06-09", kind: "holiday", label: "端午節", closesSchool: true },
  { start: "2027-06-10", end: "2027-06-23", kind: "exam", label: "第二次考試", closesSchool: true },
  {
    start: "2027-06-28",
    end: "2027-07-02",
    kind: "dlw",
    label: "深度學習周（環球自主學習週）",
    closesSchool: true,
  },
  {
    start: "2027-07-01",
    end: "2027-07-01",
    kind: "holiday",
    label: "香港特別行政區成立紀念日",
    closesSchool: true,
  },
  { start: "2027-07-15", end: "2027-08-31", kind: "holiday", label: "暑假", closesSchool: true },
];

function joinZh(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]}及${labels[1]}`;
  return `${labels.slice(0, -1).join("、")}及${labels[labels.length - 1]}`;
}

function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" }) === iso;
}

export function calendarEventsOn(iso: string): CalendarEvent[] {
  return SCHOOL_CALENDAR.filter((event) => event.start <= iso && iso <= event.end);
}

export function calendarLabelsOn(iso: string): string[] {
  return [...new Set(calendarEventsOn(iso).map((event) => event.label))];
}

/** 星期一至五，而且唔係假期／統測／考試／深度學習周／無堂日 */
export function isSchoolDay(iso: string): boolean {
  if (!weekdayFromIsoDate(iso)) return false;
  return !calendarEventsOn(iso).some((event) => event.closesSchool);
}

/** 可以作為調堂原日或對調日 */
export function isSwapAllowedDate(iso: string): boolean {
  return weekdayFromIsoDate(iso) !== null && calendarEventsOn(iso).length === 0;
}

export function swapBlockedReason(iso: string): string | null {
  if (!isValidIsoDate(iso)) return "請揀有效日期，不能調堂。";
  if (!weekdayFromIsoDate(iso)) return "唔係上課日（星期六／日），不能調堂。";
  const labels = calendarLabelsOn(iso);
  if (labels.length === 0) return null;
  return `該日為${joinZh(labels)}，不能調堂。`;
}

/** 假期、統測、考試、深度學習周等無正規課堂說明 */
export function schoolClosedReason(iso: string): string | null {
  if (!isValidIsoDate(iso)) return "請揀有效日期";
  if (!weekdayFromIsoDate(iso)) return "唔係上課日（星期六／日）";
  const closed = calendarEventsOn(iso).filter((event) => event.closesSchool);
  if (closed.length === 0) return null;
  return `該日為${joinZh([...new Set(closed.map((event) => event.label))])}，沒有正規課堂`;
}

export function coverDateError(iso: string): string | null {
  const closed = schoolClosedReason(iso);
  if (!closed) return null;
  return `${closed}，無需代堂。`;
}

export function swapPairError(leaveDate: string, partnerDate: string): string | null {
  const leave = swapBlockedReason(leaveDate);
  if (leave) return `原課堂／請假日：${leave}`;
  const partner = swapBlockedReason(partnerDate);
  if (partner) return `調往日期：${partner}`;
  return null;
}
