import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  mergeArrangementImport,
  parseArrangementWorkbook,
  resolveArrangements,
} from "../src/lib/arrangement-import";
import type { ScheduleData, Teacher } from "../src/lib/types";

function teacher(id: string, name: string): Teacher {
  return { id, name, code: id, subjects: ["中文"] };
}

function schedule(): ScheduleData {
  return {
    meta: {
      school: "t",
      schoolEn: "t",
      year: "2026-2027",
      updatedAt: "2026-09-01T00:00:00.000Z",
      source: "t",
    },
    teachers: [teacher("余", "余沛峰"), teacher("會", "朱會強"), teacher("彤", "林紀彤")],
    classes: [{ id: "2A", name: "2A", form: 2, homeRoom: "301", classTeacherIds: ["會"] }],
    rooms: [{ id: "301", name: "301室", kind: "classroom" }],
    lessons: [
      {
        id: "chi",
        day: "tue",
        periodId: "p2",
        classIds: ["2A"],
        teacherIds: ["余"],
        subject: "中文",
        roomId: "301",
        kind: "lesson",
      },
      {
        id: "geo",
        day: "tue",
        periodId: "p1",
        classIds: ["2A"],
        teacherIds: ["會"],
        subject: "地理",
        roomId: "301",
        kind: "lesson",
      },
    ],
  };
}

function workbook() {
  const rows = [
    ["日期", "8/9/2026"],
    ["", "原課堂老師", "請假類別", "安排", "節數", "班別科目", "地點", "代堂／調堂老師", "節數", "班別科目", "地點", "備註"],
    ["", "余沛峰", "病假", "代堂", "第2節", "2A 中文", "301", "朱會強", "第2節", "2A 中文", "301", ""],
    ["", "朱會強", "事假", "調堂", "第1節", "2A 地理", "301", "余沛峰", "", "", "", "-> 9/9 lesson 2"],
    ["", "林紀彤", "病假", "代堂", "第7節", "2A 中文", "301", "朱會強", "第7節", "", "", ""],
    ["", "余沛峰", "公假", "合班", "第8節", "2A 中文", "301", "朱會強", "第8節", "", "", ""],
    ["", "朱會強", "病假", "代堂", "第3節", "2A 地理", "301", "林紀彤", "第3節", "", "", ""],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "9-8");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

{
  const parsed = parseArrangementWorkbook(workbook(), { source: "notice.xlsx" });
  assert.equal(parsed.rows.length, 5, `應讀到 5 行，實際 ${parsed.rows.length}`);
  const resolved = resolveArrangements(schedule(), parsed);
  assert.equal(resolved.summary.swapCount, 1);
  assert.equal(resolved.summary.combineCount, 1);
  assert.ok(resolved.summary.coverCount >= 2);
  const swap = resolved.swaps[0];
  assert.equal(swap?.leaveTeacherId, "會");
  assert.equal(swap?.partnerTeacherId, "余");
  assert.equal(swap?.leaveDate, "2026-09-08");
  assert.equal(swap?.partnerDate, "2026-09-09");
  assert.deepEqual(swap?.partnerPeriodIds, ["p2"]);
  assert.equal(swap?.leaveSubject, "地理");

  const plan = resolved.plans.find((p) => p.date === "2026-09-08");
  assert.ok(plan);
  const sick = plan?.assignments.find((a) => a.periodId === "p2" && a.absenteeId === "余");
  assert.equal(sick?.coverTeacherId, "會");
  assert.equal(sick?.skipBalance, false);
  assert.deepEqual(sick?.classIds, ["2A"]);

  const fromLam = plan?.assignments.find((a) => a.periodId === "p7");
  assert.equal(fromLam?.absenteeId, "余", "林紀彤的課堂紀錄應記入余沛峰");
  assert.equal(fromLam?.coverTeacherId, "會");

  const combine = plan?.assignments.find((a) => a.periodId === "p8");
  assert.equal(combine?.skipBalance, true);
  assert.match(combine?.reason ?? "", /合班/);

  assert.ok(
    plan?.assignments.every((a) => a.coverTeacherId !== "彤"),
    "林紀彤不可被編為代堂",
  );
  assert.ok(plan?.leftover.some((s) => s.periodId === "p3" && s.teacherId === "會"));

  const merged = mergeArrangementImport({ balances: {}, plans: [] }, [], resolved);
  assert.equal(merged.balances["余"], -2, "病假代堂兩堂先扣余");
  assert.equal(merged.balances["會"], 1, "合班同未編成的代堂不加減會的結餘以外，只計成功代堂");
  const again = mergeArrangementImport(
    { balances: merged.balances, plans: merged.plans },
    merged.swaps,
    resolved,
  );
  assert.equal(again.plans.length, 1, "同一日再上存要覆蓋，不可疊加");
  assert.equal(again.swaps.length, 1);
  assert.equal(again.balances["余"], -2);
}

console.log("arrangement import tests passed");
