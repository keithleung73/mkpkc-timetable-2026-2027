import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyBalances,
  applyConfirmedCovers,
  eligibleCoverTeachers,
  generateCoverPlan,
  isOccupied,
  manualCoverTeachers,
  mergeCoverSlotIntoPlan,
  MAX_COVER_LOAD_PER_DAY,
  MAX_OWN_LESSONS,
  ownTeachingLoadOnDay,
  PTH_DRAMA_COMBINE_REASON,
  slotsToCover,
  undoBalances,
  validateCoverPlan,
  weekdayFromIsoDate,
  wouldExceedConsecutiveCoverDays,
  buildCoverDatesByTeacher,
} from "../src/lib/cover";
import { ensureHomeroomLessons } from "../src/lib/homeroom";
import { isAdminDutySubject, isNonRegularLesson } from "../src/lib/lesson-kind";
import { coverPdfFilename, coverPdfRows, formatCoverFormDate } from "../src/lib/cover-pdf";
import { renderCoverPdf } from "../src/lib/cover-pdf-server";
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
    classIds: extra?.classIds ?? ["1A"],
    teacherIds: extra?.teacherIds ?? [teacherId],
    subject: extra?.subject ?? "數學",
    roomId: extra?.roomId ?? "201",
    kind: extra?.kind ?? "lesson",
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
    classes: [{ id: "1A", name: "1A", form: 1, homeRoom: "201", classTeacherIds: [] }],
    rooms: [{ id: "201", name: "201", kind: "classroom" }],
    lessons,
  };
}

const A = teacher("A", "甲");
const B = teacher("B", "乙");
const C = teacher("C", "丙");
const D = teacher("D", "丁");
const E = teacher("E", "戊");
const F = teacher("F", "己");

{
  const d = weekdayFromIsoDate("2026-09-01");
  assert.equal(d, "tue", "2026-09-01 應為星期二（香港）");
  assert.equal(weekdayFromIsoDate("2026-09-05"), null, "星期六應無上課日");
}

{
  const data = schedule(
    [A, B, C, D],
    [
      lesson("abs-p1", "mon", "p1", "A"),
      lesson("abs-p3", "mon", "p3", "A"),
      lesson("b-p2", "mon", "p2", "B"),
    ],
  );
  const plan = generateCoverPlan(data, "mon", "2026-08-31", ["A"], {
    B: -4,
    C: -1,
    D: 2,
  });
  assert.equal(plan.slots.length, 2);
  const p1 = plan.assignments.find((x) => x.periodId === "p1");
  assert.equal(p1?.coverTeacherId, "B", "負數最深者應先代 p1");
  const p3 = plan.assignments.find((x) => x.periodId === "p3");
  assert.ok(p3);
  assert.notEqual(p3?.coverTeacherId, "A");
}

{
  const own = Array.from({ length: MAX_OWN_LESSONS + 1 }, (_, i) =>
    lesson(`e-${i}`, "mon", `p${i + 1}`, "E"),
  );
  const data = schedule(
    [A, B, E],
    [lesson("abs-p8", "mon", "p8", "A"), ...own],
  );
  const list = eligibleCoverTeachers(
    data,
    "mon",
    new Set(["A"]),
    { B: 0, E: -9 },
    {
      periodId: "p8",
      classIds: ["1A"],
      subject: "數學",
      roomId: "201",
      teacherId: "A",
      teacherName: "甲",
    },
    [],
  );
  assert.ok(!list.some((x) => x.teacher.id === "E"), "當日超過 6 堂不能代");
  assert.ok(list.some((x) => x.teacher.id === "B"));
}

{
  const data = schedule(
    [A, B, C],
    [lesson("abs-p3", "mon", "p3", "A"), lesson("abs-p4", "mon", "p4", "A")],
  );
  const plan = generateCoverPlan(data, "mon", "2026-08-31", ["A"], { B: -5, C: 0 });
  const byB = plan.assignments.filter((x) => x.coverTeacherId === "B");
  const periods = byB.map((x) => x.periodId).sort();
  assert.notDeepEqual(periods, ["p3", "p4"], "同一人不能連續代 p3 同 p4");
  assert.equal(plan.assignments.length, 2, "兩堂都應有人代");
  assert.equal(new Set(plan.assignments.map((x) => x.coverTeacherId)).size, 2);
}

{
  const data = schedule(
    [A, B],
    [
      lesson("abs-p1", "mon", "p1", "A"),
      lesson("abs-p3", "mon", "p3", "A"),
      lesson("abs-p5", "mon", "p5", "A"),
    ],
  );
  const plan = generateCoverPlan(data, "mon", "2026-08-31", ["A"], { B: -9 });
  const byB = plan.assignments.filter((x) => x.coverTeacherId === "B");
  assert.equal(byB.length, MAX_COVER_LOAD_PER_DAY, "同一人一日最多代兩堂");
  assert.equal(plan.assignments.length, 2);
  assert.equal(plan.leftover.length, 1, "第三堂應留給其他人，無人則未編");
}

{
  const data = schedule(
    [A, B],
    [
      lesson("hr", "mon", "hr", "A", { subject: "班主任節" }),
      lesson("abs-p3", "mon", "p3", "A"),
      lesson("abs-p5", "mon", "p5", "A"),
    ],
  );
  const plan = generateCoverPlan(data, "mon", "2026-08-31", ["A"], { B: -9 });
  const load = plan.assignments
    .filter((x) => x.coverTeacherId === "B")
    .reduce((n, a) => n + (a.periodId === "hr" ? 0.5 : 1), 0);
  assert.ok(load <= MAX_COVER_LOAD_PER_DAY, "連班主任節 0.5 都唔可以超過兩堂");
  assert.equal(plan.leftover.length, 1);
}

{
  const data = schedule(
    [A, B],
    [lesson("abs-p1", "mon", "p1", "A"), lesson("b-p1", "mon", "p1", "B")],
  );
  const plan = generateCoverPlan(data, "mon", "2026-08-31", ["A"], { B: -10 });
  assert.equal(plan.assignments.length, 0, "該節有課就不能代");
  assert.equal(plan.leftover.length, 1);
}

{
  const data = schedule(
    [A, B],
    [lesson("abs-p1", "mon", "p1", "A"), lesson("meet", "mon", "p2", "B", { kind: "meeting" })],
  );
  const plan = generateCoverPlan(data, "mon", "2026-08-31", ["A"], { B: -3 });
  assert.equal(plan.assignments[0]?.coverTeacherId, "B");
}

{
  const data = schedule(
    [A, B],
    [
      lesson("abs-p1", "mon", "p1", "A"),
      lesson("clp", "mon", "p1", "B", { kind: "meeting", subject: "CLP 中一數學", classIds: [] }),
    ],
  );
  const plan = generateCoverPlan(data, "mon", "2026-08-31", ["A"], { B: -3 });
  assert.equal(plan.assignments[0]?.coverTeacherId, "B", "CLP 唔當正規課，該節仍可代堂");
  const next = applyBalances({}, plan);
  assert.equal(next.A, -1);
  assert.equal(next.B, 1);
  const undone = undoBalances(next, plan);
  assert.equal(undone.A, 0);
  assert.equal(undone.B, 0);
}

{
  const data = schedule(
    [A, B, F],
    [lesson("abs-p5", "mon", "p5", "A"), lesson("f-p4", "mon", "p4", "F"), lesson("f-p6", "mon", "p6", "F")],
  );
  const plan = generateCoverPlan(data, "mon", "2026-08-31", ["A"], { F: -8, B: 0 });
  assert.equal(plan.assignments[0]?.coverTeacherId, "F", "自己課堂相鄰仍可代中間一節");
}

{
  const data = schedule([A, B], [lesson("abs-p1", "mon", "p1", "A")]);
  const plan = generateCoverPlan(data, "mon", "2026-08-31", ["A"], {});
  const leftoverPlan = { ...plan, assignments: [], leftover: plan.slots };
  const next = applyBalances({}, leftoverPlan);
  assert.equal(next.A, -1, "未編配仍然扣請假人分數");
  assert.equal(next.B ?? 0, 0);
}

{
  assert.equal(formatCoverFormDate("2026-09-01", "tue"), "1/9/2026(二)");
  assert.equal(coverPdfFilename("2026-09-01"), "代堂調堂處理_1.9.2026.pdf");
}

{
  const data = schedule(
    [A, B],
    [
      lesson("a3", "mon", "p3", "A"),
      lesson("a4", "mon", "p4", "A"),
      lesson("a6", "mon", "p6", "A"),
    ],
  );
  const plan = generateCoverPlan(data, "mon", "2026-08-31", ["A"], { B: -2 });
  const leftoverOnly = {
    ...plan,
    assignments: [],
    leftover: plan.slots,
  };
  const mergedRows = coverPdfRows(leftoverOnly, data);
  assert.ok(
    mergedRows.some((r) => r.periods === "3，4"),
    "未能編配嘅連堂應合併節數",
  );
  assert.ok(mergedRows.some((r) => r.periods === "6"));
  assert.equal(mergedRows[0]?.showDate, true);
  assert.equal(mergedRows[0]?.action, "代堂");
  assert.equal(mergedRows[0]?.remark, "未能編配");
}

{
  const avoid = teacher("才", "張敬才");
  const other = teacher("B", "乙");
  const data = schedule(
    [A, avoid, other],
    [lesson("abs-p1", "mon", "p1", "A")],
  );
  const plan = generateCoverPlan(data, "mon", "2026-08-31", ["A"], {
    才: -9,
    B: -1,
  });
  assert.equal(plan.assignments[0]?.coverTeacherId, "B", "盡量少編名單即使結餘更負都應後排");
}

{
  const map = buildCoverDatesByTeacher([
    { date: "2026-08-31", assignments: [{ coverTeacherId: "B" }] },
    { date: "2026-09-01", assignments: [{ coverTeacherId: "B" }] },
  ]);
  assert.equal(
    wouldExceedConsecutiveCoverDays("B", "2026-09-02", map),
    true,
    "一、二已代，三再代會超過連續兩日",
  );
  assert.equal(
    wouldExceedConsecutiveCoverDays("B", "2026-09-03", map),
    false,
    "一、二已代，四再代唔算連續三日",
  );

  const data = schedule(
    [A, B, C],
    [lesson("abs-p1", "wed", "p1", "A")],
  );
  const plan = generateCoverPlan(
    data,
    "wed",
    "2026-09-02",
    ["A"],
    { B: -5, C: 0 },
    [
      { date: "2026-08-31", assignments: [{ coverTeacherId: "B" }] },
      { date: "2026-09-01", assignments: [{ coverTeacherId: "B" }] },
    ],
  );
  assert.equal(plan.assignments[0]?.coverTeacherId, "C", "連續代堂風險者應後排");
}

{
  const data = schedule([A, B], [lesson("abs-p1", "mon", "p1", "A")]);
  const sick = generateCoverPlan(data, "mon", "2026-08-31", ["A"], {}, [], { A: "sick" });
  const sickNext = applyBalances({}, sick);
  assert.equal(sickNext.A, -1);
  assert.equal(sickNext.B, 1);

  const official = generateCoverPlan(data, "mon", "2026-08-31", ["A"], {}, [], { A: "official" });
  assert.equal(official.leaveKinds?.A, "official");
  const officialNext = applyBalances({ A: 3, B: 1 }, official);
  assert.equal(officialNext.A, 3, "公假請假人不加減");
  assert.equal(officialNext.B, 1, "公假代堂人不加減");
  const officialUndone = undoBalances(officialNext, official);
  assert.equal(officialUndone.A, 3);
  assert.equal(officialUndone.B, 1);

  const leftoverOfficial = { ...official, assignments: [], leftover: official.slots };
  const leftoverNext = applyBalances({}, leftoverOfficial);
  assert.equal(leftoverNext.A ?? 0, 0, "公假未能編配亦不扣分");
}

{
  const data = schedule(
    [A, B, C],
    [lesson("abs-p1", "mon", "p1", "A"), lesson("c-p3", "mon", "p3", "C")],
  );
  const mixed = generateCoverPlan(data, "mon", "2026-08-31", ["A", "C"], { B: 0 }, [], {
    A: "official",
    C: "personal",
  });
  const next = applyBalances({}, mixed);
  assert.equal(next.A ?? 0, 0, "甲公假不計");
  assert.equal(next.C, -1, "丙事假仍 −1");
}

{
  const data = schedule(
    [A, B],
    [lesson("abs-p1", "mon", "p1", "A"), lesson("abs-p3", "mon", "p3", "A")],
  );
  const merged = mergeCoverSlotIntoPlan(
    data,
    null,
    "2026-08-31",
    "mon",
    "A",
    "p1",
    "B",
    "official",
  );
  assert.ok(!("error" in merged));
  if ("error" in merged) throw new Error(String(merged.error));
  assert.equal(merged.assignments.length, 1);
  assert.equal(merged.assignments[0]?.coverTeacherId, "B");
  assert.equal(merged.leftover.length, 0, "只轉入該一節，其他堂唔當 leftover");
  assert.equal(merged.slots.length, 1);
  assert.equal(merged.leaveKinds?.A, "official");
  const after = applyBalances({}, merged);
  assert.equal(after.A ?? 0, 0);
  assert.equal(after.B ?? 0, 0);
}

{
  const six = Array.from({ length: MAX_OWN_LESSONS }, (_, i) =>
    lesson(`b-${i}`, "mon", `p${i === 5 ? 8 : i + 1}`, "B"),
  );
  const data = schedule(
    [A, B],
    [
      lesson("hr", "mon", "hr", "B", { subject: "班主任節", classIds: ["1B"] }),
      ...six,
      lesson("abs-p6", "mon", "p6", "A"),
    ],
  );
  const list = eligibleCoverTeachers(
    data,
    "mon",
    new Set(["A"]),
    { B: 0 },
    {
      periodId: "p6",
      classIds: ["1A"],
      subject: "數學",
      roomId: "201",
      teacherId: "A",
      teacherName: "甲",
    },
    [],
  );
  assert.ok(list.some((x) => x.teacher.id === "B"), "6 堂正規課加班主任節仍可代人");
}

{
  const seven = Array.from({ length: MAX_OWN_LESSONS + 1 }, (_, i) =>
    lesson(`c-${i}`, "mon", `p${i === 5 ? 8 : i + 1}`, "C"),
  );
  const data = schedule(
    [A, C],
    [...seven, lesson("abs-p6", "mon", "p6", "A")],
  );
  const slot = {
    periodId: "p6",
    classIds: ["1A"],
    subject: "數學",
    roomId: "201",
    teacherId: "A",
    teacherName: "甲",
  };
  const auto = eligibleCoverTeachers(data, "mon", new Set(["A"]), { C: -4 }, slot, []);
  assert.ok(!auto.some((x) => x.teacher.id === "C"), "7 堂正規課不能自動代");
  const manual = manualCoverTeachers(data, "mon", new Set(["A"]), { C: -4 }, slot, []);
  assert.ok(manual.some((x) => x.teacher.id === "C"), "該節得閒仍可人手指定");
}

{
  const data = schedule(
    [A, B, C],
    [
      lesson("a-p6", "wed", "p6", "A", { classIds: ["1A"] }),
      lesson("c-p6", "wed", "p6", "C", { classIds: ["1B"] }),
    ],
  );
  const seeded = mergeCoverSlotIntoPlan(data, null, "2026-09-02", "wed", "A", "p6", "B", "sick");
  assert.ok(!("error" in seeded));
  if ("error" in seeded) throw new Error(String(seeded.error));
  const again = generateCoverPlan(data, "wed", "2026-09-02", ["C"], { B: -9, C: 0 }, [], { C: "sick" }, seeded);
  const bSlots = again.assignments.filter((x) => x.coverTeacherId === "B");
  assert.equal(bSlots.length, 1, "人手已指定 B 代第六節後，不能再派 B 代另一班第六節");
  assert.equal(bSlots[0]?.absenteeId, "A");
  assert.ok(
    again.assignments.some((x) => x.absenteeId === "A" && x.coverTeacherId === "B"),
    "人手代堂要保留並入帳",
  );
  const occupied = applyConfirmedCovers(data, "2026-09-02", [seeded]);
  const occupiedIds = occupied.lessons.filter((l) => l.teacherIds.includes("B") && l.periodId === "p6");
  assert.ok(occupiedIds.some((l) => l.id.startsWith("cover:")), "已入帳代堂要佔用該節");

  const withB = {
    ...again,
    leftover: [],
    assignments: [
      {
        periodId: "p6",
        classIds: ["1B"],
        subject: "數學",
        roomId: "201",
        absenteeId: "C",
        absenteeName: "丙",
        coverTeacherId: "B",
        coverTeacherName: "乙",
        coverBalanceBefore: 0,
        reason: "人手指定",
      },
    ],
    slots: again.slots.filter((s) => s.teacherId === "C"),
    absentees: ["C"],
  };
  assert.equal(validateCoverPlan(data, withB, {}), null, "人手指定只要該節得閒就可以入帳");
  const counted = applyBalances({}, withB);
  assert.equal(counted.B, 1, "人手代堂要計節數");
  assert.equal(counted.C, -1);
}

{
  const 彤 = teacher("彤", "林紀彤");
  const 泰 = teacher("泰", "林至泰");
  const data = schedule(
    [彤, 泰, A, B, C],
    [
      lesson("pth", "tue", "p7", "彤", { classIds: ["1A"], subject: "普話" }),
      lesson("drama", "tue", "p7", "泰", { classIds: ["1A"], subject: "戲劇", roomId: "513" }),
      lesson("a-p1", "tue", "p1", "A"),
      lesson("a-p3", "tue", "p3", "A"),
    ],
  );
  const plan = generateCoverPlan(data, "tue", "2026-09-08", ["彤"], { 泰: -9, B: 0 });
  const p7 = plan.assignments.find((a) => a.periodId === "p7");
  assert.equal(p7?.coverTeacherId, "泰");
  assert.equal(p7?.combine, true);
  assert.equal(p7?.reason, PTH_DRAMA_COMBINE_REASON);
  assert.equal(plan.leftover.length, 0);
  const next = applyBalances({}, plan);
  assert.equal(next.彤 ?? 0, 0, "合班不計請假人 ±");
  assert.equal(next.泰 ?? 0, 0, "合班不計代堂人 ±");
  const undone = undoBalances(next, plan);
  assert.equal(undone.彤 ?? 0, 0);
  assert.equal(undone.泰 ?? 0, 0);
  assert.equal(validateCoverPlan(data, plan, {}), null, "合班搭檔該節有課仍可入帳");

  const both = generateCoverPlan(data, "tue", "2026-09-08", ["彤", "泰"], { B: -8, C: 0 });
  assert.ok(
    !both.assignments.some((a) => a.combine),
    "雙方請假就不能合班",
  );
  assert.ok(both.assignments.length + both.leftover.length >= 2);

  const withLoad = generateCoverPlan(data, "tue", "2026-09-08", ["彤", "A"], { 泰: -9, B: 0, C: 0 });
  const by泰 = withLoad.assignments.filter((a) => a.coverTeacherId === "泰");
  assert.ok(by泰.some((a) => a.combine && a.periodId === "p7"), "合班仍要列入安排");
  assert.equal(
    by泰.filter((a) => !a.combine).length,
    MAX_COVER_LOAD_PER_DAY,
    "合班不佔一日兩堂代堂上限",
  );

  const merged = mergeCoverSlotIntoPlan(data, null, "2026-09-08", "tue", "彤", "p7", "泰", "sick");
  assert.ok(!("error" in merged));
  if ("error" in merged) throw new Error(String(merged.error));
  assert.equal(merged.assignments[0]?.combine, true);
  assert.equal(merged.assignments[0]?.reason, PTH_DRAMA_COMBINE_REASON);
  const mergedNext = applyBalances({}, merged);
  assert.equal(mergedNext.彤 ?? 0, 0);
  assert.equal(mergedNext.泰 ?? 0, 0);

  const pdfRows = coverPdfRows(plan, data);
  assert.ok(pdfRows.some((r) => r.action === "合班" && r.arrangement === "合班（不計節數）"));

  const dates = buildCoverDatesByTeacher([
    { date: "2026-08-31", assignments: [{ coverTeacherId: "泰", combine: true }] },
    { date: "2026-09-01", assignments: [{ coverTeacherId: "泰", combine: true }] },
  ]);
  assert.equal(
    wouldExceedConsecutiveCoverDays("泰", "2026-09-02", dates),
    false,
    "合班唔計連續代堂日",
  );
}

{
  assert.equal(isAdminDutySubject("聯咨會"), true);
  assert.equal(isAdminDutySubject("首席會"), true);
  assert.equal(isAdminDutySubject("學校部會"), true);
  assert.equal(isAdminDutySubject("學務部會議"), true);
  assert.equal(isAdminDutySubject("學生部會議"), true);
  assert.equal(isAdminDutySubject("資創會"), true);
  assert.equal(isAdminDutySubject("資訊及創新部會"), true);
  assert.equal(isAdminDutySubject("CLP 中二數學"), true);
  assert.equal(isAdminDutySubject("數學"), false);

  const 龍 = teacher("龍", "梁國龍");
  const 毅 = teacher("毅", "黃子毅");
  const data = schedule(
    [A, 龍, 毅],
    [
      lesson("ial-p3", "tue", "p3", "龍", { classIds: ["6E-IAL"], subject: "6IAL 會計" }),
      lesson("ial-p4", "tue", "p4", "龍", { classIds: ["6E-IAL"], subject: "6IAL 會計" }),
      lesson("council", "tue", "p7", "龍", { subject: "聯咨會", classIds: [], roomId: "" }),
      lesson("hr", "thu", "hr", "毅", { subject: "班主任節", classIds: ["5B"] }),
      lesson("m1", "thu", "p1", "毅", { classIds: ["3E"], subject: "數學" }),
      lesson("m2", "thu", "p2", "毅", { classIds: ["5B"], subject: "數必" }),
      lesson("m3", "thu", "p3", "毅", { classIds: ["6A"], subject: "數必" }),
      lesson("m4", "thu", "p4", "毅", { classIds: ["6A"], subject: "數必" }),
      lesson("m8", "thu", "p8", "毅", { classIds: ["5B"], subject: "數必" }),
      lesson("abs-p6", "thu", "p6", "A"),
    ],
  );
  assert.equal(isNonRegularLesson(data.lessons.find((l) => l.id === "council")!), true);
  assert.equal(ownTeachingLoadOnDay(data, "龍", "tue"), 2, "聯咨會不計入當日堂數");
  assert.equal(isOccupied(data, "龍", "tue", "p7"), false, "聯咨會唔擋代堂");
  const 龍slots = slotsToCover(data, "tue", ["龍"]);
  assert.equal(龍slots.length, 2);
  assert.ok(!龍slots.some((s) => s.subject.includes("聯咨")));

  assert.equal(ownTeachingLoadOnDay(data, "毅", "thu"), 5, "班主任節不計入當日堂數");
  const list = eligibleCoverTeachers(
    data,
    "thu",
    new Set(["A"]),
    { 毅: 0 },
    {
      periodId: "p6",
      classIds: ["1A"],
      subject: "數學",
      roomId: "201",
      teacherId: "A",
      teacherName: "甲",
    },
    [],
  );
  assert.ok(list.some((x) => x.teacher.id === "毅"), "5 堂加班主任節仍可代人");

  const hrPlan = generateCoverPlan(data, "thu", "2026-09-03", ["毅"], { A: -4 });
  const hrAssign = hrPlan.assignments.find((a) => a.periodId === "hr");
  assert.ok(hrAssign, "班主任節仍要代");
  const hrPts = hrPlan.assignments
    .filter((a) => a.coverTeacherId === (hrAssign?.coverTeacherId ?? ""))
    .reduce((n, a) => n + (a.periodId === "hr" ? 0.5 : 1), 0);
  assert.ok(hrPts >= 0.5);
}

{
  const live = ensureHomeroomLessons(
    JSON.parse(readFileSync("data/schedule.json", "utf8")) as ScheduleData,
  );
  assert.equal(ownTeachingLoadOnDay(live, "龍", "tue"), 2, "正式課表：梁國龍星期二只計兩堂");
  const 龍cover = slotsToCover(live, "tue", ["龍"]);
  assert.ok(!龍cover.some((s) => /聯咨|首席|部會|CLP/i.test(s.subject)));
  assert.equal(ownTeachingLoadOnDay(live, "毅", "thu"), 5, "正式課表：黃子毅星期四 5 堂正規課");
  assert.ok(
    !live.lessons.some(
      (l) => l.teacherIds.includes("萍") && l.day === "tue" && l.periodId === "p3" && l.subject.includes("數必"),
    ),
    "已刪吳燕萍星期二第三節 5C 數必",
  );
  assert.ok(
    !live.lessons.some(
      (l) => l.teacherIds.includes("娟") && l.day === "tue" && l.periodId === "p3" && l.subject.includes("電腦"),
    ),
    "已刪李麗娟星期二第三節 2B 電腦",
  );
  assert.ok(
    !live.lessons.some(
      (l) =>
        l.teacherIds.includes("麗") &&
        l.day === "thu" &&
        l.periodId === "p1" &&
        l.classIds.includes("1D"),
    ),
    "已刪陳麗嫻星期四第一節 1D 中國語文",
  );
  assert.ok(
    live.lessons.some(
      (l) =>
        l.teacherIds.includes("鵠") &&
        l.day === "thu" &&
        l.periodId === "p2" &&
        l.classIds.includes("5E") &&
        l.subject.includes("公民") &&
        l.roomId === "504A" &&
        l.kind !== "meeting",
    ),
    "鄧鵠耀星期四第二節按 10-09 總表係 5E 公民 504A",
  );
  assert.ok(
    !live.lessons.some(
      (l) =>
        l.teacherIds.includes("鵠") &&
        l.day === "thu" &&
        ["p3", "p5", "p7"].includes(l.periodId) &&
        l.kind !== "meeting",
    ),
    "鄧鵠耀星期四第三、五、七節仍無課堂（範本橫向合併幽靈課已清）",
  );
  assert.ok(
    live.lessons.some(
      (l) =>
        l.teacherIds.includes("言") &&
        l.day === "tue" &&
        l.periodId === "p6" &&
        l.subject.includes("數一") &&
        l.roomId === "N201",
    ),
    "周柏言星期二第六節按 10-09 總表係中六數一 N201",
  );
  assert.ok(
    !live.lessons.some(
      (l) => l.teacherIds.includes("言") && l.day === "mon" && l.periodId === "p9" && l.kind !== "meeting",
    ),
    "周柏言星期一第九節不應再有中六數一",
  );
  assert.ok(
    live.lessons.some(
      (l) =>
        l.teacherIds.includes("言") &&
        l.day === "thu" &&
        l.periodId === "p8" &&
        /數一/.test(l.subject) &&
        /數二|M2/.test(l.subject),
    ),
    "周柏言星期四第八節按 10-09 總表係中四 M1、M2",
  );
  assert.ok(
    live.lessons.some(
      (l) =>
        l.teacherIds.includes("永") &&
        l.day === "mon" &&
        l.periodId === "p7" &&
        /數二|M2/.test(l.subject) &&
        l.classIds.includes("4A"),
    ),
    "張永泰星期一第七節按 10-09 總表係中四數二",
  );
  assert.ok(
    live.lessons.some(
      (l) =>
        l.teacherIds.includes("永") &&
        l.day === "mon" &&
        l.periodId === "p8" &&
        /數二|M2/.test(l.subject) &&
        l.classIds.includes("4A"),
    ),
    "張永泰星期一第八節按 10-09 總表係中四數二",
  );
  assert.ok(
    !live.lessons.some(
      (l) =>
        l.teacherIds.includes("鵠") &&
        l.day === "wed" &&
        l.periodId === "p3" &&
        l.classIds.includes("2D"),
    ),
    "鄧鵠耀星期三第三節不應有由星期一複製嘅 2D 公經社",
  );
  const 鵠mon = live.lessons.filter((l) => l.teacherIds.includes("鵠") && l.day === "mon" && l.kind !== "meeting");
  assert.ok(
    鵠mon.some((l) => l.periodId === "p3" && l.classIds.includes("2D")),
    "鄧鵠耀星期一第三節仍係 2D 公經社",
  );
  assert.ok(
    live.lessons.some(
      (l) => l.teacherIds.includes("鵠") && l.day === "wed" && l.periodId === "p1" && l.classIds.includes("6E"),
    ),
    "鄧鵠耀星期三第一節仍係 6E 公民",
  );
}

void (async () => {
  const data = schedule([A, B], [lesson("abs-p1", "mon", "p1", "A")]);
  const plan = generateCoverPlan(data, "mon", "2026-08-31", ["A"], {});
  const buf = await renderCoverPdf(plan, data, { reason: "請假" });
  assert.ok(buf.subarray(0, 4).toString() === "%PDF", "應產出 PDF");
  assert.ok(buf.length > 800);
  assert.ok(buf.includes(Buffer.from("/Helvetica")), "數字要用 Helvetica，避免中文字型缺 ASCII 變方塊");
  console.log("cover rules ok");
})();

