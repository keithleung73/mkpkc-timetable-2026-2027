import assert from "node:assert/strict";
import {
  collectTeacherRecords,
  dateInRange,
  monthEndIso,
  monthStartIso,
  rangeFromPreset,
  summarizeTeacherRecords,
  teacherRecordSheetRows,
} from "../src/lib/teacher-records";
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
  leaveKinds: { 振: "official" },
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
  leftover: [
    {
      periodId: "p5",
      classIds: ["5E"],
      subject: "5IAL 會計",
      roomId: "506",
      teacherId: "振",
      teacherName: "陳振華",
    },
  ],
};

{
  assert.equal(monthStartIso("2026-09-17"), "2026-09-01");
  assert.equal(monthEndIso("2026-09-17"), "2026-09-30");
  assert.equal(monthEndIso("2026-02-10"), "2026-02-28");
  const day = rangeFromPreset("day", "2026-09-03");
  assert.deepEqual(day, { start: "2026-09-03", end: "2026-09-03" });
  const week = rangeFromPreset("week", "2026-09-03");
  assert.equal(week.start, "2026-08-31");
  assert.equal(week.end, "2026-09-04");
  const month = rangeFromPreset("month", "2026-09-03");
  assert.deepEqual(month, { start: "2026-09-01", end: "2026-09-30" });
  const custom = rangeFromPreset("custom", "2026-09-03", "2026-09-10", "2026-09-04");
  assert.deepEqual(custom, { start: "2026-09-04", end: "2026-09-10" });
  assert.equal(dateInRange("2026-09-03", month), true);
  assert.equal(dateInRange("2026-10-01", month), false);
}

{
  const sep = rangeFromPreset("month", "2026-09-01");
  const 振 = collectTeacherRecords([swap], [plan], "振", sep);
  assert.ok(振.some((r) => r.kind === "swap" && r.role === "leave" && r.date === "2026-09-03"));
  assert.ok(振.some((r) => r.kind === "swap" && r.roleLabel === "調入" && r.date === "2026-09-04"));
  assert.ok(振.some((r) => r.kind === "cover" && r.role === "absentee"));
  assert.ok(振.some((r) => r.role === "uncovered" && r.periodId === "p5"));
  assert.ok(!振.some((r) => r.teacherId === "鍵" && r.role === "cover"));

  const 鍵 = collectTeacherRecords([swap], [plan], "鍵", sep);
  assert.equal(鍵.length, 1);
  assert.equal(鍵[0]?.role, "cover");
  assert.equal(鍵[0]?.counterpartName, "陳振華");

  const 蕭 = collectTeacherRecords([swap], [plan], "蕭", sep);
  assert.ok(蕭.some((r) => r.roleLabel === "對手調出" && r.date === "2026-09-04"));
  assert.ok(蕭.some((r) => r.roleLabel === "對手調入" && r.date === "2026-09-03"));

  const dayOnly = collectTeacherRecords([swap], [plan], "振", rangeFromPreset("day", "2026-09-04"));
  assert.ok(dayOnly.every((r) => r.date === "2026-09-04"));
  assert.ok(dayOnly.some((r) => r.kind === "swap"));
  assert.ok(!dayOnly.some((r) => r.kind === "cover"));

  const covers = collectTeacherRecords([swap], [plan], "振", sep, "cover");
  assert.ok(covers.every((r) => r.kind === "cover"));

  const all = collectTeacherRecords([swap], [plan], null, sep);
  const names = new Set(all.map((r) => r.teacherId));
  assert.ok(names.has("振") && names.has("鍵") && names.has("蕭"));

  const sum = summarizeTeacherRecords(振);
  assert.ok(sum.total === 振.length);
  assert.ok(sum.absentee >= 1);
  assert.ok(sum.uncovered >= 1);
  assert.equal(sum.absenteePeriods, 1);
  const 鍵Sum = summarizeTeacherRecords(鍵);
  assert.equal(鍵Sum.coveringPeriods, 1);
  const sheet = teacherRecordSheetRows(振);
  assert.equal(sheet[0]?.[0], "老師");
  assert.ok(sheet[0]?.includes("代堂節數"));
  assert.ok(sheet.some((line) => line.includes("陳振華") && line.includes("調堂")));
}

console.log("teacher records query ok");
