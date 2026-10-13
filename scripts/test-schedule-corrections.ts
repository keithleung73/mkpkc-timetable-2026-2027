import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOMEROOM_PERIOD } from "../src/lib/constants";
import {
  coverLoadNote,
  eligibleCoverTeachers,
  generateCoverPlan,
  SIX_LESSON_COVER_NOTE,
  teachingLessonsOnDay,
} from "../src/lib/cover";
import { coverPdfRows } from "../src/lib/cover-pdf";
import {
  applyScheduleCorrections,
  prepareSchedule,
  RESIGNED_COVER_REASON,
} from "../src/lib/schedule-corrections";
import type { Lesson, ScheduleData, Teacher } from "../src/lib/types";

function teacher(id: string, name: string, subjects: string[] = ["中文"]): Teacher {
  return { id, name, code: id, subjects };
}

function lesson(id: string, teacherIds: string[], extra?: Partial<Lesson>): Lesson {
  return {
    id,
    day: extra?.day ?? "mon",
    periodId: extra?.periodId ?? "p1",
    classIds: extra?.classIds ?? ["2A"],
    teacherIds,
    subject: extra?.subject ?? "中文",
    roomId: extra?.roomId ?? "301",
    kind: extra?.kind ?? "lesson",
  };
}

function baseSchedule(lessons: Lesson[], teachers: Teacher[]): ScheduleData {
  return {
    meta: {
      school: "t",
      schoolEn: "t",
      year: "2026-2027",
      updatedAt: "2026-09-01T00:00:00.000Z",
      source: "t",
    },
    teachers,
    classes: [{ id: "2A", name: "2A", form: 2, homeRoom: "301", classTeacherIds: ["彤"] }],
    rooms: [{ id: "301", name: "301室", kind: "classroom" }],
    lessons,
  };
}

{
  const raw = baseSchedule(
    [lesson("chi", ["彤"]), lesson("meet", ["彤"], { subject: "CLP 中文", kind: "meeting", classIds: [] })],
    [teacher("彤", "林紀彤"), teacher("會", "朱會強", ["地理"])],
  );
  const once = applyScheduleCorrections(raw);
  const twice = applyScheduleCorrections(once);
  assert.deepEqual(once.classes[0]?.classTeacherIds, ["會"]);
  assert.equal(once.teachers.filter((t) => t.id === "余").length, 1);
  assert.equal(twice.teachers.filter((t) => t.id === "余").length, 1, "重複套用不可再加余");
  assert.equal(once.teachers.find((t) => t.id === "余")?.name, "余沛峰");
  assert.ok(once.teachers.find((t) => t.id === "彤")?.name.includes("已辭職"));
  assert.equal((twice.teachers.find((t) => t.id === "彤")?.name.match(/已辭職/g) ?? []).length, 1);
  assert.deepEqual(once.lessons[0]?.teacherIds, ["余"]);
  assert.deepEqual(once.lessons[1]?.teacherIds, ["余"]);
  assert.deepEqual(twice.lessons[0]?.teacherIds, ["余"]);

  const prepared = prepareSchedule(raw);
  const again = prepareSchedule(prepared);
  const hr = prepared.lessons.filter(
    (l) => l.periodId === HOMEROOM_PERIOD.id && l.classIds.includes("2A"),
  );
  assert.equal(hr.length, 5);
  assert.ok(hr.every((l) => l.teacherIds.length === 1 && l.teacherIds[0] === "會"));
  assert.equal(again.lessons.length, prepared.lessons.length, "班主任節不可重複加入");
  assert.equal(again.teachers.filter((t) => t.id === "余").length, 1);
}

{
  const raw = JSON.parse(readFileSync("data/schedule.json", "utf8")) as ScheduleData;
  const tongBefore = raw.lessons.filter((l) => l.teacherIds.includes("彤")).length;
  const live = prepareSchedule(raw);
  const again = prepareSchedule(live);
  assert.deepEqual(live.classes.find((c) => c.id === "2A")?.classTeacherIds, ["會"]);
  assert.equal(live.teachers.find((t) => t.id === "會")?.name, "朱會強");
  assert.equal(live.teachers.filter((t) => t.id === "余" && t.name === "余沛峰").length, 1);
  assert.ok(live.teachers.find((t) => t.id === "彤")?.name.includes("已辭職"));
  assert.equal(
    (again.teachers.find((t) => t.id === "彤")?.name.match(/已辭職/g) ?? []).length,
    1,
  );
  assert.ok(!live.lessons.some((l) => l.teacherIds.includes("彤")), "林紀彤不再有課堂");
  assert.equal(again.lessons.length, live.lessons.length);

  const yuLessons = live.lessons.filter((l) => l.teacherIds.includes("余"));
  const moved = tongBefore === 0 ? yuLessons.length : tongBefore;
  assert.equal(yuLessons.length, moved, "余沛峰承接林紀彤原本全部課堂");
  assert.ok(tongBefore === 0 || tongBefore >= 20, `林紀彤原有課堂 ${tongBefore}`);

  const chi2a = yuLessons.filter((l) => l.subject === "中文" && l.classIds.includes("2A"));
  const chi5b = yuLessons.filter((l) => l.subject === "中文" && l.classIds.includes("5B"));
  const chi5c = yuLessons.filter((l) => l.subject === "中文" && l.classIds.includes("5C"));
  const pth = yuLessons.filter((l) => l.subject === "普話");
  assert.equal(chi2a.length, 7, "2A 中文維持原時間表節數");
  assert.equal(chi5b.length, 7);
  assert.equal(chi5c.length, 6);
  assert.equal(pth.length, 7);
  assert.ok(yuLessons.some((l) => l.subject === "重摘課" && l.classIds.includes("2A")));

  const hr = live.lessons.filter(
    (l) => l.periodId === HOMEROOM_PERIOD.id && l.classIds.includes("2A"),
  );
  assert.equal(hr.length, 5);
  assert.ok(hr.every((l) => l.teacherIds.length === 1 && l.teacherIds[0] === "會"));
  assert.ok(
    live.lessons.some((l) => l.teacherIds.includes("會") && l.subject === "地理" && l.classIds.includes("2A")),
    "朱會強原有 2A 地理不變",
  );
  const otherHr = live.lessons.filter(
    (l) => l.periodId === HOMEROOM_PERIOD.id && !l.classIds.includes("2A"),
  );
  assert.equal(otherHr.length, 0, "只補 2A 班主任節");

  const slot = {
    periodId: "p1",
    classIds: ["1A"],
    subject: "中文",
    roomId: "201",
    teacherId: "會",
    teacherName: "朱會強",
  };
  const options = eligibleCoverTeachers(live, "mon", new Set(["會"]), { 彤: -9 }, slot, []);
  assert.ok(!options.some((o) => o.teacher.id === "彤"), RESIGNED_COVER_REASON);
  const plan = generateCoverPlan(live, "mon", "2026-10-12", ["余"], {});
  assert.ok(plan.slots.some((s) => s.classIds.includes("2A") && s.subject === "中文"));
  assert.ok(plan.assignments.every((a) => a.coverTeacherId !== "彤"));
  assert.ok(plan.slots.every((s) => s.teacherId !== "彤"));
}

{
  const free = teacher("乙", "乙老師");
  const busy = teacher("丙", "丙老師");
  const absent = teacher("甲", "甲老師");
  const lessons: Lesson[] = [lesson("abs", ["甲"], { periodId: "p8", classIds: ["1A"] })];
  for (let i = 1; i <= 6; i++) {
    lessons.push(lesson(`free-${i}`, ["乙"], { periodId: `p${i}`, classIds: ["3A"] }));
  }
  for (let i = 1; i <= 7; i++) {
    lessons.push(lesson(`busy-${i}`, ["丙"], { periodId: `p${i}`, classIds: ["4A"] }));
  }
  const data = baseSchedule(lessons, [absent, free, busy]);
  data.classes[0] = { id: "1A", name: "1A", form: 1, homeRoom: "201", classTeacherIds: [] };
  const corrected = applyScheduleCorrections(data);
  assert.equal(teachingLessonsOnDay(corrected, "乙", "mon").length, 6);
  assert.equal(coverLoadNote(6), SIX_LESSON_COVER_NOTE);
  const plan = generateCoverPlan(corrected, "mon", "2026-10-12", ["甲"], { 乙: -3, 丙: -9 });
  const hit = plan.assignments.find((a) => a.periodId === "p8");
  assert.equal(hit?.coverTeacherId, "乙");
  assert.match(hit?.reason ?? "", /代後共 7 堂/);
  const rows = coverPdfRows(plan, corrected);
  assert.ok(rows.some((r) => r.coverTeacher === "乙老師" && r.remark === SIX_LESSON_COVER_NOTE));
  const slot = {
    periodId: "p8",
    classIds: ["1A"],
    subject: "中文",
    roomId: "301",
    teacherId: "甲",
    teacherName: "甲老師",
  };
  const options = eligibleCoverTeachers(corrected, "mon", new Set(["甲"]), {}, slot, []);
  assert.ok(options.some((o) => o.teacher.id === "乙"));
  assert.ok(!options.some((o) => o.teacher.id === "丙"), "多於 6 堂仍然不能代堂");
}

console.log("schedule corrections tests passed");
