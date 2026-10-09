import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOMEROOM_PERIOD_ID } from "../src/lib/homeroom";
import {
  applyScheduleCorrections,
  prepareSchedule,
} from "../src/lib/schedule-corrections";
import type { Lesson, ScheduleData, Teacher } from "../src/lib/types";

function teacher(id: string, name: string): Teacher {
  return { id, name, code: id, subjects: ["中文"] };
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

{
  const raw: ScheduleData = {
    meta: {
      school: "t",
      schoolEn: "t",
      year: "2026-2027",
      updatedAt: "2026-09-01T00:00:00.000Z",
      source: "t",
    },
    teachers: [teacher("彤", "林紀彤"), teacher("會", "朱會強")],
    classes: [{ id: "2A", name: "2A", form: 2, homeRoom: "301", classTeacherIds: ["彤"] }],
    rooms: [{ id: "301", name: "301室", kind: "classroom" }],
    lessons: [lesson("chi", ["彤"])],
  };
  const once = applyScheduleCorrections(raw);
  const twice = applyScheduleCorrections(once);
  assert.deepEqual(once.classes[0]?.classTeacherIds, ["會"]);
  assert.equal(once.teachers.filter((t) => t.id === "余").length, 1);
  assert.equal(twice.teachers.filter((t) => t.id === "余").length, 1, "重複套用不可再加余");
  assert.equal(once.teachers.find((t) => t.id === "余")?.name, "余沛峰");
  assert.ok(once.teachers.find((t) => t.id === "彤")?.name.includes("已辭職"));
  assert.ok(twice.teachers.find((t) => t.id === "彤")?.name.includes("已辭職"));
  assert.deepEqual(once.lessons[0]?.teacherIds, ["余"]);
  assert.deepEqual(twice.lessons[0]?.teacherIds, ["余"]);
  assert.equal((twice.teachers.find((t) => t.id === "彤")?.name.match(/已辭職/g) ?? []).length, 1);

  const prepared = prepareSchedule(raw);
  const hr = prepared.lessons.find(
    (l) => l.periodId === HOMEROOM_PERIOD_ID && l.classIds.includes("2A") && l.day === "mon",
  );
  assert.deepEqual(hr?.teacherIds, ["會"]);
}

{
  const live = prepareSchedule(
    JSON.parse(readFileSync("data/schedule.json", "utf8")) as ScheduleData,
  );
  assert.deepEqual(live.classes.find((c) => c.id === "2A")?.classTeacherIds, ["會"]);
  assert.ok(live.teachers.some((t) => t.id === "余" && t.name === "余沛峰"));
  assert.ok(live.teachers.some((t) => t.id === "彤" && t.name.includes("已辭職")));
  assert.ok(!live.lessons.some((l) => l.teacherIds.includes("彤")));
  const chi = live.lessons.filter(
    (l) => l.teacherIds.includes("余") && l.subject === "中文" && l.classIds.includes("2A"),
  );
  assert.ok(chi.length >= 4, `2A 中文應由余沛峰任教，實際 ${chi.length}`);
  const hr = live.lessons.filter(
    (l) => l.periodId === HOMEROOM_PERIOD_ID && l.classIds.includes("2A"),
  );
  assert.equal(hr.length, 5);
  assert.ok(hr.every((l) => l.teacherIds.length === 1 && l.teacherIds[0] === "會"));
}

console.log("schedule corrections tests passed");
