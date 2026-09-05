import assert from "node:assert/strict";
import {
  applyBalances,
  eligibleCoverTeachers,
  generateCoverPlan,
  mergeCoverSlotIntoPlan,
  MAX_OWN_LESSONS,
  undoBalances,
  weekdayFromIsoDate,
  wouldExceedConsecutiveCoverDays,
  buildCoverDatesByTeacher,
} from "../src/lib/cover";
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
  if ("error" in merged) throw new Error(merged.error);
  assert.equal(merged.assignments.length, 1);
  assert.equal(merged.assignments[0]?.coverTeacherId, "B");
  assert.equal(merged.leftover.length, 0, "只轉入該一節，其他堂唔當 leftover");
  assert.equal(merged.slots.length, 1);
  assert.equal(merged.leaveKinds?.A, "official");
  const after = applyBalances({}, merged);
  assert.equal(after.A ?? 0, 0);
  assert.equal(after.B ?? 0, 0);
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

