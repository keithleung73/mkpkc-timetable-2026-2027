import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyBalances, generateCoverPlan, slotsToCover } from "../src/lib/cover";
import {
  coverWeight,
  ensureHomeroomLessons,
  formatCoverPoints,
  HOMEROOM_PERIOD_ID,
  HOMEROOM_SUBJECT,
} from "../src/lib/homeroom";
import { buildLeaveUnits } from "../src/lib/swap";
import type { Lesson, ScheduleData, Teacher } from "../src/lib/types";

function teacher(id: string, name: string): Teacher {
  return { id, name, code: id, subjects: ["中文"] };
}

function lesson(
  id: string,
  day: Lesson["day"],
  periodId: string,
  teacherIds: string[],
  extra?: Partial<Lesson>,
): Lesson {
  return {
    id,
    day,
    periodId,
    classIds: extra?.classIds ?? ["2A"],
    teacherIds,
    subject: extra?.subject ?? "數學",
    roomId: extra?.roomId ?? "201",
    kind: extra?.kind ?? "lesson",
  };
}

const 彤 = teacher("彤", "林紀彤");
const 筠 = teacher("筠", "陳紀筠");
const 鳳 = teacher("鳳", "黃轉鳳");
const 銘 = teacher("銘", "郭家銘");
const 代 = teacher("代", "代課甲");

{
  assert.equal(coverWeight("hr"), 0.5);
  assert.equal(coverWeight("p1"), 1);
  assert.equal(formatCoverPoints(0.5), "+0.5");
  assert.equal(formatCoverPoints(-0.5), "-0.5");
  assert.equal(formatCoverPoints(1), "+1");
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
    teachers: [彤, 筠, 鳳, 銘, 代],
    classes: [
      { id: "2A", name: "2A", form: 2, homeRoom: "201", classTeacherIds: ["彤"] },
      { id: "1A", name: "1A", form: 1, homeRoom: "101", classTeacherIds: ["鳳", "銘"] },
      { id: "4E-IAL", name: "4E IAL", form: 4, stream: "IAL", homeRoom: "", classTeacherIds: [] },
    ],
    rooms: [
      { id: "201", name: "201室", kind: "classroom" },
      { id: "101", name: "101室", kind: "classroom" },
    ],
    lessons: [lesson("math", "mon", "p3", ["彤"])],
  };
  const data = ensureHomeroomLessons(raw);
  const hr = data.lessons.filter((l) => l.periodId === HOMEROOM_PERIOD_ID);
  assert.equal(hr.length, 10, "2A+1A × 五日；IAL 無班主任");
  assert.ok(hr.every((l) => l.subject === HOMEROOM_SUBJECT));
  assert.deepEqual(
    hr.find((l) => l.day === "mon" && l.classIds.includes("2A"))?.teacherIds,
    ["彤"],
  );

  const onlyDeputyAway = slotsToCover(data, "mon", ["銘"]);
  assert.ok(
    !onlyDeputyAway.some((s) => s.periodId === "hr"),
    "兩位班主任得其中一位請假，不用另找人代班主任節",
  );

  const bothAway = slotsToCover(data, "mon", ["鳳", "銘"]);
  const hr1a = bothAway.filter((s) => s.periodId === "hr" && s.classIds.includes("1A"));
  assert.equal(hr1a.length, 1, "兩位班主任都請假，班主任節只代一次");

  const sole = slotsToCover(data, "mon", ["彤"]);
  assert.ok(sole.some((s) => s.periodId === "hr" && s.classIds.includes("2A") && s.teacherId === "彤"));

  const plan = generateCoverPlan(data, "mon", "2026-08-31", ["彤"], { 代: -2 });
  const hrAssign = plan.assignments.find((a) => a.periodId === "hr");
  assert.ok(hrAssign, "單一班主任請假要代班主任節");
  assert.equal(hrAssign?.coverTeacherId, "代");
  const next = applyBalances({}, plan);
  assert.equal(next.彤, -1.5, "班主任節 0.5 + 第三節 1");
  assert.equal(next.代, 1.5);

  const units = buildLeaveUnits(data, "彤", ["2026-08-31"]);
  assert.ok(
    !units.some((u) => u.periodId === "hr"),
    "班主任節只代堂，不列入調堂單位",
  );
}

{
  const live = ensureHomeroomLessons(
    JSON.parse(readFileSync("data/schedule.json", "utf8")) as ScheduleData,
  );
  const cls = live.classes.find((c) => c.id === "2A");
  assert.ok(cls?.classTeacherIds.includes("彤"));
  const slots = slotsToCover(live, "mon", ["彤"]);
  assert.ok(
    slots.some((s) => s.periodId === "hr" && s.classIds.includes("2A")),
    "正式課表：2A 林紀彤星期一班主任節要代",
  );
  const oneOfTwo = slotsToCover(live, "mon", ["鳳"]);
  assert.ok(
    !oneOfTwo.some((s) => s.periodId === "hr" && s.classIds.includes("1A")),
    "1A 另一位班主任郭家銘仍在，不用代班主任節",
  );
}

console.log("homeroom cover tests passed");
