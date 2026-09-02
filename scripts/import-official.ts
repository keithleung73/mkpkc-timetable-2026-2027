import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildOfficialSchedule } from "../src/lib/parse-teacher-timetable";

const tt = readFileSync(join(process.cwd(), "data", "official", "teacher-timetables.xlsx"));
const assignPath = join(process.cwd(), "data", "official", "teachers-assignment.xlsx");
let assign: Buffer | undefined;
try {
  assign = readFileSync(assignPath);
} catch {
  assign = undefined;
}
const data = buildOfficialSchedule(tt, assign);
const out = join(process.cwd(), "data", "schedule.json");
writeFileSync(out, JSON.stringify(data, null, 2), "utf8");
const hua = data.lessons.filter((l) => l.teacherIds.includes("華") && l.kind !== "meeting");
const tang = data.teachers.filter(
  (t) => t.name.includes("鄧") || (t.englishName ?? "").toLowerCase().includes("tang"),
);
console.log(
  `teachers ${data.teachers.length} lessons ${data.lessons.length} classes ${data.classes.length}`,
);
console.log("source", data.meta.source);
console.log("林子華 slots", hua.length);
console.log(
  hua
    .slice(0, 12)
    .map((l) => `${l.day} ${l.periodId} ${l.subject} ${l.classIds.join(",")} ${l.roomId}`)
    .join("\n"),
);
console.log(
  "Tang/鄧",
  tang.map((t) => `${t.name} | ${t.englishName} | ${t.code}`),
);
