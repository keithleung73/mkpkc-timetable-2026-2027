import assert from "node:assert/strict";
import {
  calendarEventsOn,
  coverDateError,
  isSchoolDay,
  isSwapAllowedDate,
  schoolClosedReason,
  swapBlockedReason,
} from "../src/lib/school-calendar";
import { planTeacherLeaveSwaps } from "../src/lib/swap";
import { confirmedSwapManual, swapSearchDates } from "../src/lib/swap-records";
import type { Lesson, ScheduleData, Teacher } from "../src/lib/types";

function teacher(id: string, name: string): Teacher {
  return { id, name, code: id, subjects: ["數學"] };
}

function lesson(
  id: string,
  day: Lesson["day"],
  periodId: string,
  teacherId: string,
  extra?: Partial<Lesson>,
): Lesson {
  return {
    id,
    day,
    periodId,
    classIds: extra?.classIds ?? ["2D"],
    teacherIds: extra?.teacherIds ?? [teacherId],
    subject: extra?.subject ?? "數學",
    roomId: extra?.roomId ?? "305",
    kind: extra?.kind ?? "lesson",
    ...extra,
  };
}

function schedule(teachers: Teacher[], lessons: Lesson[]): ScheduleData {
  return {
    meta: {
      school: "test",
      schoolEn: "test",
      year: "2026-2027",
      updatedAt: "2026-09-01T00:00:00.000Z",
      source: "test",
    },
    teachers,
    classes: [{ id: "2D", name: "2D", form: 2, homeRoom: "305", classTeacherIds: [] }],
    rooms: [{ id: "305", name: "305", kind: "classroom" }],
    lessons,
  };
}

const 振 = teacher("振", "陳振華");
const 乙 = teacher("乙", "乙老師");

{
  assert.equal(isSchoolDay("2026-09-03"), true, "開學後普通星期四應上課");
  assert.equal(isSwapAllowedDate("2026-09-03"), true);
  assert.equal(swapBlockedReason("2026-09-03"), null);
  assert.equal(schoolClosedReason("2026-09-03"), null);
  assert.equal(schoolClosedReason("2026-09-04"), null, "星期五正常上課");
  assert.equal(coverDateError("2026-09-04"), null);
  assert.match(swapBlockedReason("not-a-date") ?? "", /有效日期/);
  assert.match(coverDateError("2026-09-99") ?? "", /有效日期/);
}

{
  assert.equal(isSchoolDay("2026-10-01"), false, "國慶日無堂");
  assert.equal(isSwapAllowedDate("2026-10-01"), false);
  assert.match(swapBlockedReason("2026-10-01") ?? "", /國慶日/);
  assert.match(schoolClosedReason("2026-10-01") ?? "", /國慶日/);
  assert.match(coverDateError("2026-10-01") ?? "", /無需代堂/);
}

{
  assert.equal(isSchoolDay("2026-10-27"), false, "統測／深度學習周無正規課堂");
  assert.equal(isSwapAllowedDate("2026-10-27"), false);
  const reason = swapBlockedReason("2026-10-27") ?? "";
  assert.match(reason, /統測/);
  assert.match(reason, /深度學習周/);
  assert.match(schoolClosedReason("2026-10-27") ?? "", /統測|深度學習周/);
  assert.match(coverDateError("2026-10-27") ?? "", /無需代堂/);
}

{
  assert.equal(isSchoolDay("2027-01-07"), false);
  assert.equal(isSwapAllowedDate("2027-01-07"), false);
  assert.match(swapBlockedReason("2027-01-07") ?? "", /考試/);
  assert.match(coverDateError("2027-01-07") ?? "", /無需代堂/);
  assert.match(coverDateError("2026-12-08") ?? "", /深度學習周/);
  assert.match(coverDateError("2027-05-03") ?? "", /深度學習周|環球自主學習/);
  assert.match(coverDateError("2027-04-06") ?? "", /統測/);
  assert.match(coverDateError("2027-06-10") ?? "", /考試/);
}

{
  assert.equal(isSchoolDay("2026-10-09"), false, "教師發展日學生不用上課");
  assert.equal(isSchoolDay("2026-09-28"), false, "陸運會無正規課");
  assert.equal(isSchoolDay("2026-11-20"), false, "全校旅行");
  assert.equal(isSchoolDay("2026-12-04"), false, "開放日");
  assert.match(coverDateError("2026-10-09") ?? "", /教師專業發展日/);
  assert.equal(isSwapAllowedDate("2026-09-05"), false);
  assert.match(swapBlockedReason("2026-09-05") ?? "", /星期六/);
}

{
  const onHoliday = calendarEventsOn("2027-07-01").map((e) => e.kind).sort();
  assert.ok(onHoliday.includes("holiday"));
  assert.ok(onHoliday.includes("dlw"));
  assert.equal(isSchoolDay("2027-07-01"), false);
  assert.match(swapBlockedReason("2027-07-01") ?? "", /香港特別行政區成立紀念日/);
}

{
  const dates = swapSearchDates("2026-10-26", [], 21);
  assert.ok(dates.includes("2026-10-26"));
  assert.ok(!dates.includes("2026-10-27"), "第一次統測／DLW 不能作為對調日");
  assert.ok(!dates.includes("2026-10-28"));
  assert.ok(!dates.includes("2026-10-29"));
  assert.ok(!dates.includes("2026-10-30"));
  assert.ok(dates.includes("2026-11-02"));
  assert.ok(!dates.includes("2026-10-01"));
}

{
  const dates = swapSearchDates("2026-09-28", [], 14);
  assert.ok(!dates.includes("2026-09-28"));
  assert.ok(!dates.includes("2026-09-29"));
  assert.ok(!dates.includes("2026-09-30"));
  assert.ok(!dates.includes("2026-10-01"));
  assert.ok(!dates.includes("2026-10-02"));
  assert.ok(dates.includes("2026-10-05"));
  assert.ok(!dates.includes("2026-10-09"), "教師發展日不能調堂");
}

{
  const data = schedule(
    [振, 乙],
    [lesson("振-p3", "thu", "p3", "振"), lesson("乙-p1", "fri", "p1", "乙")],
  );
  const plan = planTeacherLeaveSwaps(data, "振", ["2026-10-01"], "2026-09-03");
  assert.equal(plan.results.length, 0, "國慶日無需調堂單位");
  assert.ok(plan.notes.some((n) => n.includes("國慶日")));
}

{
  const data = schedule(
    [振, 乙],
    [lesson("振-p2", "tue", "p2", "振"), lesson("乙-p5", "wed", "p5", "乙", { classIds: ["2D"] })],
  );
  const plan = planTeacherLeaveSwaps(data, "振", ["2026-10-27"], "2026-10-27");
  assert.equal(plan.results.length, 0, "統測／深度學習周無需調堂單位");
  assert.ok(plan.notes.some((n) => /統測|深度學習周/.test(n) && n.includes("無需調堂及代堂")));
}

{
  const data = schedule(
    [振, 乙],
    [
      lesson("振-p5", "wed", "p5", "振"),
      lesson("乙-p1", "tue", "p1", "乙"),
    ],
  );
  const plan = planTeacherLeaveSwaps(data, "振", ["2026-10-21"], "2026-10-21");
  const hit = plan.results.find((r) => r.unit.periodId === "p5");
  assert.equal(hit?.status, "swap");
  assert.equal(hit?.swap?.partnerDate, "2026-11-03", "應跳過 10/27 統測／DLW，改對 11/3");
  assert.notEqual(hit?.swap?.partnerDate, "2026-10-27");
}

{
  const data = schedule([振], [lesson("振-p7", "thu", "p7", "振")]);
  const holiday = confirmedSwapManual(data, {
    leaveTeacherId: "振",
    leaveDate: "2026-10-01",
    leavePeriodId: "p7",
    partnerDate: "2026-10-08",
    partnerPeriodId: "p4",
  });
  assert.ok("error" in holiday);
  assert.match(String(holiday.error), /國慶日/);

  const dlw = confirmedSwapManual(data, {
    leaveTeacherId: "振",
    leaveDate: "2026-10-27",
    leavePeriodId: "p2",
    partnerDate: "2026-11-03",
    partnerPeriodId: "p4",
  });
  assert.ok("error" in dlw);
  assert.match(String(dlw.error), /統測|深度學習周/);

  const examPartner = confirmedSwapManual(data, {
    leaveTeacherId: "振",
    leaveDate: "2026-09-03",
    leavePeriodId: "p7",
    partnerDate: "2027-01-07",
    partnerPeriodId: "p4",
  });
  assert.ok("error" in examPartner);
  assert.match(String(examPartner.error), /考試/);

  const ok = confirmedSwapManual(data, {
    leaveTeacherId: "振",
    leaveDate: "2026-09-03",
    leavePeriodId: "p7",
    partnerDate: "2026-09-10",
    partnerPeriodId: "p4",
  });
  assert.ok(!("error" in ok), "普通上課日仍可調堂");
}

console.log("school calendar / no-swap dates ok");
