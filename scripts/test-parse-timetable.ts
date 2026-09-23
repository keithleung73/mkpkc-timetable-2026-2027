import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseTeacherTimetableWorkbook } from "../src/lib/parse-teacher-timetable";

function sheetWithHorizontalLessonMerge(): Buffer {
  const wb = XLSX.utils.book_new();
  const rows: string[][] = [];
  for (let i = 0; i < 20; i++) rows[i] = ["", "", "", "", "", ""];
  rows[0][0] = "時間表：測試老師, TEST TEACHER";
  rows[1] = ["", "星期一", "星期二", "星期三", "星期四", "星期五"];
  rows[2] = ["08:00 - 08:25", "早會", "早會/班主任節", "早會/班主任節", "早會/班主任節", "班主任節"];
  rows[3] = ["08:25 - 09:00", "2D 公經社 305", "", "", "", ""];
  rows[4] = ["09:00 - 09:35", "2D 公經社 305", "", "", "", ""];
  rows[7] = ["10:05 - 10:40", "1C 公經社 203", "1C 公經社 203", "", "", ""];
  rows[15] = ["14:05 - 14:40", "3E 公經社 210", "6E 公民科 604A", "", "", ""];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!merges"] = [
    { s: { r: 7, c: 1 }, e: { r: 7, c: 4 } },
    { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "試");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

{
  const { lessons } = parseTeacherTimetableWorkbook(sheetWithHorizontalLessonMerge());
  const of = (day: string, period: string) =>
    lessons.filter((l) => l.day === day && l.periodId === period && l.teacherIds.includes("試"));

  assert.equal(of("mon", "p1").length, 1, "直向合併仍應填星期一第一、二節");
  assert.equal(of("mon", "p2").length, 1, "直向合併應把雙節抄到第二節");
  assert.equal(of("mon", "p1")[0]?.classIds[0], "2D");

  assert.equal(of("tue", "p3").length, 1, "星期二第三節本身有堂，應保留");
  assert.equal(of("wed", "p3").length, 0, "橫向合併唔可以把星期一／二嘅課抄去星期三");
  assert.equal(of("thu", "p3").length, 0, "橫向合併唔可以把課抄去星期四");

  assert.equal(of("mon", "p7")[0]?.classIds[0], "3E");
  assert.equal(of("tue", "p7")[0]?.classIds[0], "6E");
  assert.equal(of("wed", "p7").length, 0);
  assert.equal(of("thu", "p7").length, 0);
}

console.log("parse timetable merges ok");
