import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eligibleCoverTeachers, generateCoverPlan, isOccupied, teachingLessonsOnDay } from "../src/lib/cover";
import { isFree } from "../src/lib/queries";
import { isNonRegularLesson, lessonOccupiesTeacher } from "../src/lib/lesson-kind";
import { planTeacherLeaveSwaps } from "../src/lib/swap";
import {
  applyConfirmedSwaps,
  confirmedSwapManual,
  makeConfirmedSwap,
} from "../src/lib/swap-records";
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
    classes: [
      { id: "2D", name: "2D", form: 2, homeRoom: "305", classTeacherIds: [] },
      { id: "1A", name: "1A", form: 1, homeRoom: "201", classTeacherIds: [] },
    ],
    rooms: [{ id: "305", name: "305", kind: "classroom" }],
    lessons,
  };
}

const 振 = teacher("振", "陳振華");
const 甲 = teacher("甲", "甲老師");
const 乙 = teacher("乙", "乙老師");

{
  const clp: Lesson = {
    id: "clp",
    day: "thu",
    periodId: "p3",
    classIds: [],
    teacherIds: ["乙"],
    subject: "CLP 中二數學",
    roomId: "",
    kind: "meeting",
  };
  assert.equal(isNonRegularLesson(clp), true);
  assert.equal(lessonOccupiesTeacher(clp), false);
  const data = schedule([振, 乙], [clp]);
  assert.equal(isOccupied(data, "乙", "thu", "p3"), false, "CLP 唔佔用，可以調堂／代堂");
  assert.equal(isFree(data, "乙", "thu", "p3"), true);
}

{
  // 陳振華 3/9（四）第七節 2D 數學，調去 10/9（四）第四節空堂
  const data = schedule(
    [振, 甲, 乙],
    [
      lesson("振-p1", "thu", "p1", "振"),
      lesson("振-p2", "thu", "p2", "振"),
      lesson("振-p3", "thu", "p3", "振"),
      lesson("振-p5", "thu", "p5", "振"),
      lesson("振-p6", "thu", "p6", "振"),
      lesson("振-2d", "thu", "p7", "振", { classIds: ["2D"], subject: "數學" }),
      lesson("振-p8", "thu", "p8", "振"),
      lesson("甲-p4", "thu", "p4", "甲", { classIds: ["1A"], subject: "英文" }),
    ],
  );
  assert.equal(isOccupied(data, "振", "thu", "p4"), false, "原先 10/9 第四節係空堂");
  assert.equal(teachingLessonsOnDay(data, "振", "thu").length, 7);

  const record = confirmedSwapManual(data, {
    leaveTeacherId: "振",
    leaveDate: "2026-09-03",
    leavePeriodId: "p7",
    partnerDate: "2026-09-10",
    partnerPeriodId: "p4",
  });
  assert.ok(!("error" in record), "人手調去空堂應成功");
  if ("error" in record) throw new Error(String(record.error));

  const on10 = applyConfirmedSwaps(data, "2026-09-10", [record]);
  assert.equal(isOccupied(on10, "振", "thu", "p4"), true, "調堂後 10/9 第四節有 2D 數學");
  assert.equal(teachingLessonsOnDay(on10, "振", "thu").length, 8, "10/9 變成 8 堂");
  assert.ok(
    on10.lessons.some(
      (l) => l.periodId === "p4" && l.teacherIds.includes("振") && l.classIds.includes("2D"),
    ),
  );

  const plan = generateCoverPlan(on10, "thu", "2026-09-10", ["甲"], { 振: -9, 乙: 0 });
  assert.ok(
    !plan.assignments.some((a) => a.coverTeacherId === "振"),
    "10/9 有老師缺席時，陳振華該節不能代堂",
  );
  const list = eligibleCoverTeachers(
    on10,
    "thu",
    new Set(["甲"]),
    { 振: -9, 乙: 0 },
    {
      periodId: "p4",
      classIds: ["1A"],
      subject: "英文",
      roomId: "201",
      teacherId: "甲",
      teacherName: "甲老師",
    },
    [],
  );
  assert.ok(!list.some((x) => x.teacher.id === "振"), "有效課表下陳振華不在代堂名單");
  assert.ok(list.some((x) => x.teacher.id === "乙"));
}

{
  const live = JSON.parse(readFileSync("data/schedule.json", "utf8")) as ScheduleData;
  assert.equal(isOccupied(live, "振", "thu", "p4"), false, "正式課表：陳振華星期四第四節空堂");
  assert.equal(teachingLessonsOnDay(live, "振", "thu").length, 7, "正式課表：星期四原有 7 堂");
  const p7 = live.lessons.find(
    (l) =>
      l.day === "thu" &&
      l.periodId === "p7" &&
      l.teacherIds.includes("振") &&
      l.classIds.includes("2D") &&
      l.subject.includes("數學"),
  );
  assert.ok(p7, "3/9 第七節應有 2D 數學");
  const record = confirmedSwapManual(live, {
    leaveTeacherId: "振",
    leaveDate: "2026-09-03",
    leavePeriodId: "p7",
    partnerDate: "2026-09-10",
    partnerPeriodId: "p4",
  });
  assert.ok(!("error" in record), String((record as { error?: string }).error ?? ""));
  if ("error" in record) throw new Error(String(record.error));
  const on10 = applyConfirmedSwaps(live, "2026-09-10", [record]);
  assert.equal(teachingLessonsOnDay(on10, "振", "thu").length, 8, "調去第四節後 10/9 有 8 堂");
  assert.equal(isOccupied(on10, "振", "thu", "p4"), true);
  const plan = generateCoverPlan(on10, "thu", "2026-09-10", ["曹"], {});
  assert.ok(
    !plan.assignments.some((a) => a.coverTeacherId === "振"),
    "曹思思 10/9 請假時，不應派陳振華代堂",
  );
  const p4Slot = plan.slots.find((s) => s.periodId === "p4" && s.teacherId === "曹");
  assert.ok(p4Slot, "曹思思星期四第四節有課需代");
  const p4Eligible = eligibleCoverTeachers(on10, "thu", new Set(["曹"]), {}, p4Slot, []);
  assert.ok(!p4Eligible.some((x) => x.teacher.id === "振"), "第四節候選名單沒有陳振華");
}

{
  const data = schedule(
    [振, 乙],
    [
      lesson("振-2d", "wed", "p5", "振", { classIds: ["2D"] }),
      {
        id: "乙-clp",
        day: "thu",
        periodId: "p1",
        classIds: [],
        teacherIds: ["乙"],
        subject: "CLP 中二數學",
        roomId: "",
        kind: "meeting",
      },
    ],
  );
  const plan = planTeacherLeaveSwaps(data, "振", ["2026-09-02"], "2026-09-02");
  assert.ok(plan.results.length >= 1);
  // CLP 唔擋請假老師喺對手節得閒
  const data2 = schedule(
    [振, 乙],
    [
      lesson("振-2d", "wed", "p5", "振", { classIds: ["2D"] }),
      lesson("乙-2d", "thu", "p1", "乙", { classIds: ["2D"], subject: "科學" }),
      {
        id: "振-clp",
        day: "thu",
        periodId: "p1",
        classIds: [],
        teacherIds: ["振"],
        subject: "CLP 中二數學",
        roomId: "",
        kind: "meeting",
      },
    ],
  );
  const plan2 = planTeacherLeaveSwaps(data2, "振", ["2026-09-02"], "2026-09-02");
  const hit = plan2.results.find((r) => r.unit.periodId === "p5");
  assert.equal(hit?.status, "swap", "請假老師該節得 CLP 仍可對調");
  assert.equal(hit?.swap?.partnerPeriodId, "p1");
}

{
  const rec = makeConfirmedSwap({
    leaveTeacherId: "振",
    leaveTeacherName: "陳振華",
    leaveDate: "2026-09-03",
    leaveDay: "thu",
    leavePeriodId: "p7",
    leaveLessonIds: ["x"],
    leaveSubjects: ["數學"],
    leaveClassIds: ["2D"],
    partnerDate: "2026-09-10",
    partnerDay: "thu",
    partnerPeriodId: "p4",
    partnerTeacherIds: [],
    partnerTeacherNames: [],
    partnerLessonIds: [],
    partnerSubjects: [],
    partnerClassIds: [],
    reason: "test",
  });
  assert.ok(rec.id.startsWith("swap-"));
}

console.log("swap / CLP / confirmed timetable ok");
