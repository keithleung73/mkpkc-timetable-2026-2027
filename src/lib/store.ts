import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { ScheduleData } from "./types";
import { generateSeed } from "./seed";
import { buildOfficialSchedule } from "./parse-teacher-timetable";

const DATA_PATH = path.join(process.cwd(), "data", "schedule.json");
const OFFICIAL_TT = path.join(process.cwd(), "data", "official", "teacher-timetables.xlsx");
const OFFICIAL_ASSIGN = path.join(process.cwd(), "data", "official", "teachers-assignment.xlsx");

function ensureDir() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadOfficialSchedule(): ScheduleData | null {
  if (!fs.existsSync(OFFICIAL_TT)) return null;
  const tt = fs.readFileSync(OFFICIAL_TT);
  const assign = fs.existsSync(OFFICIAL_ASSIGN) ? fs.readFileSync(OFFICIAL_ASSIGN) : undefined;
  return buildOfficialSchedule(tt, assign);
}

export function readSchedule(): ScheduleData {
  ensureDir();
  if (!fs.existsSync(DATA_PATH)) {
    const official = loadOfficialSchedule();
    const data = official ?? generateSeed();
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
    return data;
  }
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  return JSON.parse(raw) as ScheduleData;
}

export function writeSchedule(data: ScheduleData) {
  ensureDir();
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
}

export function resetSchedule(): ScheduleData {
  const official = loadOfficialSchedule();
  const data = official ?? generateSeed();
  data.meta.updatedAt = new Date().toISOString();
  writeSchedule(data);
  return data;
}
