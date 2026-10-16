import assert from "node:assert/strict";
import {
  dailyAbsenteeRows,
  dailyArrangementLines,
  dailySummary,
  handleStatusLabel,
  mergeRosterIds,
  parseDailyRosterStore,
  resolveAbsenteeTokens,
} from "../src/lib/daily-board";
import type { SavedCoverPlan } from "../src/lib/cover";
import type { ConfirmedSwap } from "../src/lib/swap-records";
import type { Lesson, ScheduleData, Teacher } from "../src/lib/types";

function teacher(id: string, name: string): Teacher {
  return { id, name, code: id, subjects: ["數學"] };
}

function lesson(
  id: string,
  day: Lesson["day"],
  periodId: string,
  teacherId: string,
  classId = "2D",
  subject = "數學",
): Lesson {
  return {
    id,
    day,
    periodId,
    classIds: [classId],
    teacherIds: [teacherId],
    subject,
    roomId: "213",
    kind: "lesson",
  };
}

const data: ScheduleData = {
  teachers: [teacher("振", "陳振華"), teacher("鍵", "伍卓鍵"), teacher("蕭", "蕭潤貞")],
  classes: [{ id: "2D", name: "2D", form: 2, homeRoom: "213", classTeacherIds: [] }],
  rooms: [{ id: "213", name: "213", kind: "classroom" }],
  lessons: [
    lesson("a", "thu", "p2", "振"),
    lesson("b", "thu", "p7", "振"),
    lesson("c", "fri", "p3", "蕭", "2D", "中文"),
  ],
  meta: {
    school: "test",
    schoolEn: "test",
    year: "2026-2027",
    source: "test",
    updatedAt: "2026-10-16T00:00:00.000Z",
  },
};

const swap: ConfirmedSwap = {
  id: "swap-1",
  confirmedAt: "2026-10-16T00:00:00.000Z",
  leaveTeacherId: "振",
  leaveTeacherName: "陳振華",
  leaveDate: "2026-10-15",
  leaveDay: "thu",
  leavePeriodId: "p7",
  leaveLessonIds: ["b"],
  leaveSubjects: ["數學"],
  leaveClassIds: ["2D"],
  partnerDate: "2026-10-16",
  partnerDay: "fri",
  partnerPeriodId: "p3",
  partnerTeacherIds: ["蕭"],
  partnerTeacherNames: ["蕭潤貞"],
  partnerLessonIds: ["c"],
  partnerSubjects: ["中文"],
  partnerClassIds: ["2D"],
  reason: "人手對調",
  leaveKind: "sick",
};

const plan: SavedCoverPlan = {
  id: "cover-1",
  confirmedAt: "2026-10-16T00:00:00.000Z",
  day: "thu",
  date: "2026-10-15",
  absentees: ["振"],
  leaveKinds: { 振: "sick" },
  slots: [],
  assignments: [
    {
      periodId: "p2",
      classIds: ["2D"],
      subject: "數學",
      roomId: "213",
      absenteeId: "振",
      absenteeName: "陳振華",
      coverTeacherId: "鍵",
      coverTeacherName: "伍卓鍵",
      coverBalanceBefore: 0,
      reason: "測試",
    },
  ],
  leftover: [],
};

{
  assert.equal(handleStatusLabel("done"), "已處理");
  assert.equal(handleStatusLabel("none"), "未處理");
  assert.equal(handleStatusLabel("partial"), "部分未處理");
  assert.equal(handleStatusLabel("na"), "無需");
}

{
  const resolved = resolveAbsenteeTokens(data.teachers, "振、陳振華，鍵");
  assert.deepEqual(resolved.ids.sort(), ["振", "鍵"].sort());
  assert.deepEqual(resolved.unmatched, []);
  const miss = resolveAbsenteeTokens(data.teachers, "不存在老師");
  assert.deepEqual(miss.ids, []);
  assert.ok(miss.unmatched.includes("不存在老師"));
}

{
  const store = parseDailyRosterStore({
    "2026-10-15": ["振", "鍵", ""],
    bad: ["振"],
  });
  assert.deepEqual(store["2026-10-15"], ["振", "鍵"]);
  assert.equal(store.bad, undefined);
}

{
  const merged = mergeRosterIds("2026-10-15", ["鍵"], [plan], [swap]);
  assert.ok(merged.includes("振"));
  assert.ok(merged.includes("鍵"));
}

{
  const rows = dailyAbsenteeRows(data, "2026-10-15", ["振", "鍵"], [plan], [swap]);
  const chan = rows.find((r) => r.teacherId === "振");
  assert.ok(chan);
  assert.equal(chan?.cover, "done");
  assert.equal(chan?.swap, "done");
  assert.equal(chan?.overall, "done");

  const ng = rows.find((r) => r.teacherId === "鍵");
  assert.ok(ng);
  assert.equal(ng?.cover, "na");
  assert.equal(ng?.overall, "done");
}

{
  const open = dailyAbsenteeRows(data, "2026-10-15", ["振"], [], []);
  assert.equal(open[0]?.cover, "none");
  assert.equal(open[0]?.swap, "none");
  assert.equal(open[0]?.overall, "open");
  assert.ok((open[0]?.coverLeft ?? 0) >= 1);
}

{
  const lines = dailyArrangementLines("2026-10-15", [plan], [swap]);
  assert.ok(lines.some((l) => l.kind === "swap-leave"));
  assert.ok(lines.some((l) => l.kind === "cover"));
  const inbound = dailyArrangementLines("2026-10-16", [plan], [swap]);
  assert.ok(inbound.some((l) => l.kind === "swap-in"));
  const summary = dailySummary(
    dailyAbsenteeRows(data, "2026-10-15", ["振"], [plan], [swap]),
    lines,
  );
  assert.equal(summary.roster, 1);
  assert.equal(summary.open, 0);
  assert.ok(summary.covers >= 1);
}

{
  const leftoverPlan: SavedCoverPlan = {
    ...plan,
    assignments: [],
    leftover: [
      {
        periodId: "p2",
        classIds: ["2D"],
        subject: "數學",
        roomId: "213",
        teacherId: "振",
        teacherName: "陳振華",
      },
    ],
  };
  const rows = dailyAbsenteeRows(data, "2026-10-15", ["振"], [leftoverPlan], [swap]);
  assert.equal(rows[0]?.cover, "none");
  assert.equal(rows[0]?.overall, "open");
}

console.log("daily board tests passed");
