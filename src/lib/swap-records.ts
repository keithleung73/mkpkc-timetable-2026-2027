import type { DayId } from "./types";

/** 已上存的調堂紀錄（來自學務部通知表或之後的確認）。 */
export type SavedSwapRecord = {
  id: string;
  leaveTeacherId: string;
  leaveTeacherName: string;
  leaveDate: string;
  leaveDay: DayId;
  leavePeriodIds: string[];
  leaveClassIds: string[];
  leaveSubject: string;
  partnerTeacherId: string;
  partnerTeacherName: string;
  partnerDate: string;
  partnerDay: DayId;
  partnerPeriodIds: string[];
  partnerClassIds: string[];
  partnerSubject: string;
  reason: string;
  savedAt: string;
};
