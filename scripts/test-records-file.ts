import assert from "node:assert/strict";
import { EXCEL_ACCEPT, RECORDS_UPLOAD_ACCEPT, fileMatchesAccept } from "../src/lib/file-accept";
import {
  buildRecordsFile,
  isExcelUploadName,
  isJsonUploadName,
  parseRecordsFile,
  recordsFileName,
  recordsFileSummary,
  replaceRecordsFromFile,
  RECORDS_FILE_KIND,
} from "../src/lib/records-file";
import { mergeOfficialArrangementImport } from "../src/lib/official-arrangements";
import type { SavedCoverPlan } from "../src/lib/cover";
import type { ConfirmedSwap } from "../src/lib/swap-records";

const swap: ConfirmedSwap = {
  id: "swap-1",
  confirmedAt: "2026-09-05T00:00:00.000Z",
  leaveTeacherId: "振",
  leaveTeacherName: "陳振華",
  leaveDate: "2026-09-03",
  leaveDay: "thu",
  leavePeriodId: "p7",
  leaveLessonIds: ["a"],
  leaveSubjects: ["數學"],
  leaveClassIds: ["2D"],
  partnerDate: "2026-09-04",
  partnerDay: "fri",
  partnerPeriodId: "p3",
  partnerTeacherIds: ["蕭"],
  partnerTeacherNames: ["蕭潤貞"],
  partnerLessonIds: ["b"],
  partnerSubjects: ["中文"],
  partnerClassIds: ["2D"],
  reason: "人手對調",
  leaveKind: "sick",
};

const plan: SavedCoverPlan = {
  id: "cover-1",
  confirmedAt: "2026-09-05T00:00:00.000Z",
  day: "thu",
  date: "2026-09-03",
  absentees: ["振"],
  leaveKinds: { 振: "sick" },
  slots: [],
  assignments: [
    {
      periodId: "p2",
      classIds: ["2E"],
      subject: "數學",
      roomId: "213",
      absenteeId: "振",
      absenteeName: "陳振華",
      coverTeacherId: "鍵",
      coverTeacherName: "伍卓鍵",
      coverBalanceBefore: 0,
      reason: "即時揀建議",
    },
  ],
  leftover: [],
};

{
  const file = buildRecordsFile({ 鍵: 1, 振: -1 }, [plan], [swap], "2026-10-14T00:00:00.000Z");
  assert.equal(file.kind, RECORDS_FILE_KIND);
  assert.equal(recordsFileName(file.exportedAt), "萬鈞伯裘書院-代調堂記錄-2026-10-14.json");
  const parsed = parseRecordsFile(JSON.stringify(file));
  if ("error" in parsed) throw new Error(parsed.error);
  assert.equal(parsed.plans.length, 1);
  assert.equal(parsed.swaps.length, 1);
  assert.equal(parsed.balances.鍵, 1);
  const summary = recordsFileSummary(parsed);
  assert.equal(summary.coverDays, 1);
  assert.equal(summary.swaps, 1);
}

{
  const loose = parseRecordsFile({
    plans: [plan],
    swaps: [swap],
    balances: { 鍵: 2 },
  });
  assert.ok(!("error" in loose), "GET /api/cover 形狀都應該讀到");
}

{
  const bad = parseRecordsFile({ kind: "other", plans: [plan], swaps: [swap] });
  assert.ok("error" in bad);
}

{
  const empty = parseRecordsFile({ plans: [], swaps: [] });
  assert.ok("error" in empty);
}

{
  const garbage = parseRecordsFile("not-json");
  assert.ok("error" in garbage);
}

{
  const replaced = replaceRecordsFromFile({
    balances: { 鍵: 9 },
    plans: [plan],
    swaps: [swap],
  });
  assert.equal(replaced.balances.鍵, 9);
  assert.equal(replaced.plans[0]?.id, "cover-1");
}

{
  const recomputed = replaceRecordsFromFile({
    balances: {},
    plans: [plan],
    swaps: [swap],
  });
  assert.equal(recomputed.balances.鍵, 1);
  assert.equal(recomputed.balances.振, -1);
}

{
  const other: SavedCoverPlan = {
    ...plan,
    id: "cover-old",
    date: "2026-09-10",
    day: "thu",
  };
  const merged = mergeOfficialArrangementImport({ balances: { 鍵: 1 }, plans: [other] }, [swap], {
    plans: [plan],
    swaps: [{ ...swap, id: "swap-new", leaveDate: "2026-09-17", partnerDate: "2026-09-18" }],
    warnings: [],
    summary: {
      dates: ["2026-09-03", "2026-09-17"],
      coverCount: 1,
      combineCount: 0,
      swapCount: 1,
      leftoverCount: 0,
      unmatchedTeachers: [],
    },
  });
  assert.ok(merged.plans.some((p) => p.id === "cover-1"));
  assert.ok(merged.plans.some((p) => p.id === "cover-old"));
  assert.equal(merged.swaps.length, 1);
  assert.equal(merged.swaps[0]?.id, "swap-new");
}

{
  assert.equal(isExcelUploadName("26-27_通知各部門調堂代堂安排.xlsx"), true);
  assert.equal(isExcelUploadName("plan.XLSM"), true);
  assert.equal(isExcelUploadName("old.xls"), true);
  assert.equal(isExcelUploadName("萬鈞伯裘書院-代調堂記錄-2026-10-14.json"), false);
  assert.equal(isJsonUploadName("萬鈞伯裘書院-代調堂記錄-2026-10-14.json"), true);
  assert.equal(isJsonUploadName("records.JSON"), true);
  assert.equal(isJsonUploadName("a.xlsx"), false);
  assert.equal(EXCEL_ACCEPT.includes("application/"), false);
  assert.ok(fileMatchesAccept({ name: "a.xlsx", type: "" }, RECORDS_UPLOAD_ACCEPT));
  assert.ok(fileMatchesAccept({ name: "a.json", type: "" }, RECORDS_UPLOAD_ACCEPT));
  assert.equal(fileMatchesAccept({ name: "a.xlsx", type: "" }, EXCEL_ACCEPT), true);
  assert.equal(fileMatchesAccept({ name: "a.json", type: "" }, EXCEL_ACCEPT), false);
}

console.log("records file tests passed");
