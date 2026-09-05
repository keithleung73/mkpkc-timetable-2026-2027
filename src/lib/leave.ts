export type LeaveKind = "sick" | "personal" | "official";

export const LEAVE_KIND_OPTIONS = [
  { id: "sick", label: "病假", countsBalance: true },
  { id: "personal", label: "事假", countsBalance: true },
  { id: "official", label: "公假", countsBalance: false },
] as const satisfies readonly { id: LeaveKind; label: string; countsBalance: boolean }[];

export const DEFAULT_LEAVE_KIND: LeaveKind = "sick";

export function isLeaveKind(value: unknown): value is LeaveKind {
  return value === "sick" || value === "personal" || value === "official";
}

export function parseLeaveKind(value: unknown, fallback: LeaveKind = DEFAULT_LEAVE_KIND): LeaveKind {
  return isLeaveKind(value) ? value : fallback;
}

export function leaveKindLabel(kind: LeaveKind | undefined): string {
  if (!kind) return "";
  return LEAVE_KIND_OPTIONS.find((o) => o.id === kind)?.label ?? kind;
}

/** 公假不計算代堂 ±；舊紀錄無請假種類則照計（當病假／事假）。 */
export function leaveCountsBalance(kind: LeaveKind | undefined): boolean {
  return kind !== "official";
}

export function cycleLeaveKind(kind: LeaveKind): LeaveKind {
  const i = LEAVE_KIND_OPTIONS.findIndex((o) => o.id === kind);
  return LEAVE_KIND_OPTIONS[(i + 1) % LEAVE_KIND_OPTIONS.length]!.id;
}
