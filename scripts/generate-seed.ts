import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { generateSeed } from "../src/lib/seed";
import { prepareSchedule } from "../src/lib/schedule-corrections";

const out = join(process.cwd(), "data", "schedule.json");
mkdirSync(dirname(out), { recursive: true });
const data = prepareSchedule(generateSeed());
writeFileSync(out, JSON.stringify(data, null, 2), "utf8");
console.log(
  `wrote ${data.teachers.length} teachers, ${data.classes.length} classes, ${data.lessons.length} lessons -> ${out}`,
);
