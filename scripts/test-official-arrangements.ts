import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  datesInRemark,
  mergeOfficialArrangementImport,
  parseOfficialAction,
  parseOfficialArrangementWorkbook,
  parseOfficialDate,
  parseOfficialLeaveKind,
  parseOfficialPeriods,
  partnerDateFromRemark,
  partnerPeriodsFromRemark,
  resolveOfficialArrangements,
  resolveOfficialTeacher,
} from "../src/lib/official-arrangements";
import { coverLoadNote, ownTeachingLoadOnDay } from "../src/lib/cover";
import type { ScheduleData } from "../src/lib/types";

const data = JSON.parse(readFileSync("data/schedule.json", "utf8")) as ScheduleData;
const xlsxPath = "/home/ubuntu/.cursor/projects/workspace/uploads/26-27__________________1fca.xlsx";
const buf = readFileSync(xlsxPath);

assert.equal(parseOfficialDate("3/9/2026"), "2026-09-03");
assert.equal(parseOfficialDate("17/9"), "2026-09-17");
assert.equal(parseOfficialDate("7/10"), "2026-10-07");
assert.deepEqual(parseOfficialPeriods("班主任節"), ["hr"]);
assert.deepEqual(parseOfficialPeriods("2+整理節"), ["p2"]);
assert.deepEqual(parseOfficialPeriods("7及8"), ["p7", "p8"]);
assert.deepEqual(parseOfficialPeriods("5及6+整理節"), ["p5", "p6"]);
assert.equal(parseOfficialLeaveKind("病假"), "sick");
assert.equal(parseOfficialLeaveKind("事假"), "personal");
assert.equal(parseOfficialLeaveKind("公假"), "official");
assert.equal(parseOfficialLeaveKind("行政需要"), "official");
assert.equal(parseOfficialAction("代堂"), "cover");
assert.equal(parseOfficialAction("調堂"), "swap");
assert.equal(parseOfficialAction("合班"), "combine");
assert.equal(partnerDateFromRemark("9/9 及 11/9", "2026-09-09"), "2026-09-11");
assert.equal(partnerDateFromRemark("還堂17/9", "2026-09-14"), "2026-09-17");
assert.equal(partnerDateFromRemark("18/9及7/10", "2026-09-18"), "2026-10-07");
assert.equal(
  partnerDateFromRemark("16/9: lesson 1, 2; 1E Maths -> 23/9 lesson 5、6; 1E Chinese", "2026-09-16"),
  "2026-09-23",
);
assert.deepEqual(
  partnerPeriodsFromRemark("16/9: lesson 1, 2; 1E Maths -> 23/9 lesson 5、6; 1E Chinese"),
  ["p5", "p6"],
);
assert.deepEqual(datesInRemark("21/9及23/9、7/10", "2026-09-21"), ["2026-09-23", "2026-10-07"]);

assert.equal(resolveOfficialTeacher(data, "韓卓穎")?.code, "韓");
assert.equal(resolveOfficialTeacher(data, "郭家銘")?.code, "銘");
assert.equal(resolveOfficialTeacher(data, "郭嘉銘")?.code, "銘");
assert.equal(resolveOfficialTeacher(data, "Raman")?.code, "KAUR");
assert.equal(resolveOfficialTeacher(data, "KAUR")?.code, "KAUR");
assert.equal(resolveOfficialTeacher(data, "Dari")?.code, "DARI");
assert.equal(resolveOfficialTeacher(data, "Wayne")?.code, "WAY");
assert.equal(resolveOfficialTeacher(data, "Johnan")?.code, "JOH");
assert.equal(resolveOfficialTeacher(data, "Johan")?.code, "JOH");
assert.equal(resolveOfficialTeacher(data, "Scott")?.code, "SCOT");
assert.equal(resolveOfficialTeacher(data, "WANG, HEUMIL")?.code, "WANG");
assert.equal(resolveOfficialTeacher(data, "MIRZA")?.code, "MIRZ");
assert.equal(resolveOfficialTeacher(data, "馮耀強")?.code, "强");
assert.equal(resolveOfficialTeacher(data, "謝穎雯")?.code, "雯");
assert.equal(resolveOfficialTeacher(data, "黃柏君")?.code, "君");
assert.equal(resolveOfficialTeacher(data, "林紀彤")?.id, "彤");
assert.equal(resolveOfficialTeacher(data, "范嘉揚")?.code, "NIC");

const parsed = parseOfficialArrangementWorkbook(buf, {
  source: "26-27_通知各部門調堂代堂安排 (九月）.xlsx",
});
assert.ok(parsed.rows.length >= 100, `rows ${parsed.rows.length}`);
assert.ok(parsed.emptyDates.includes("2026-09-04"));
assert.ok(parsed.emptyDates.includes("2026-09-11"));

const sep3 = parsed.rows.filter((r) => r.date === "2026-09-03");
assert.equal(sep3.length, 6);
assert.ok(sep3.every((r) => r.originalTeacher.includes("韓卓")));
assert.equal(sep3[0]?.action, "cover");
assert.deepEqual(sep3[0]?.leavePeriods, ["hr"]);

const sep18combine = parsed.rows.find(
  (r) => r.date === "2026-09-18" && r.action === "combine" && r.originalTeacher.includes("郭"),
);
assert.ok(sep18combine);
assert.equal(sep18combine?.coverTeacher.toUpperCase(), "KAUR");
assert.deepEqual(sep18combine?.leavePeriods, ["p5", "p6"]);

const pth = parsed.rows.filter((r) => r.date === "2026-09-22" && r.action === "combine");
assert.ok(pth.length >= 5, `pth combine ${pth.length}`);

const resolved = resolveOfficialArrangements(data, parsed);
assert.ok(resolved.summary.coverCount >= 80, `cover ${resolved.summary.coverCount}`);
assert.ok(resolved.summary.combineCount >= 10, `combine ${resolved.summary.combineCount}`);
assert.ok(resolved.summary.swapCount >= 15, `swap ${resolved.summary.swapCount}`);
assert.ok(resolved.plans.some((p) => p.date === "2026-09-03" && p.assignments.length === 6));

const han = resolved.plans.find((p) => p.date === "2026-09-03");
assert.ok(han);
assert.equal(han?.leaveKinds?.["韓"], "sick");
const duty15 = resolved.plans.find((p) => p.date === "2026-09-15")?.dutyNotes ?? [];
assert.ok(duty15.some((n) => n.kind === "duty" && n.teacherName.includes("陳曼湖")));
assert.ok(han?.assignments.some((a) => a.periodId === "hr" && a.coverTeacherName.includes("陳麗嫻")));
assert.ok(han?.assignments.some((a) => a.periodId === "p1" && a.coverTeacherId === "湖"));

const heavyOfficial = resolved.plans.flatMap((p) =>
  p.assignments
    .filter((a) => !a.combine && !a.waived)
    .map((a) => ({
      plan: p,
      assignment: a,
      own: ownTeachingLoadOnDay(data, a.coverTeacherId, p.day),
    }))
    .filter((x) => x.own >= 6),
);
for (const hit of heavyOfficial) {
  const note = coverLoadNote(hit.own);
  assert.ok(note);
  assert.ok(
    hit.assignment.reason.includes(note!),
    `${hit.plan.date} ${hit.assignment.coverTeacherName} 應備註 ${note}`,
  );
}

const kaurCombine = resolved.plans
  .find((p) => p.date === "2026-09-18")
  ?.assignments.find((a) => a.absenteeId === "銘" && a.periodId === "p5");
assert.equal(kaurCombine?.combine, true);
assert.equal(kaurCombine?.coverTeacherId, "KAUR");

const pthCombine = resolved.plans
  .find((p) => p.date === "2026-09-22")
  ?.assignments.find((a) => a.absenteeId === "彤" && a.periodId === "p3");
assert.equal(pthCombine?.combine, true);
assert.equal(pthCombine?.coverTeacherId, "泰");

const swap0914 = resolved.swaps.find((s) => s.leaveDate === "2026-09-14" && s.leaveTeacherName.includes("范嘉楊"));
assert.ok(swap0914);
assert.equal(swap0914?.partnerDate, "2026-09-17");
assert.ok(!resolved.swaps.some((s) => s.leaveDate === "2026-09-17" && s.leaveTeacherId === "慧" && s.partnerDate === "2026-09-14"));

const swap0916 = resolved.swaps.find((s) => s.leaveDate === "2026-09-16" && s.leaveTeacherId === "秋");
assert.ok(swap0916);
assert.equal(swap0916?.partnerDate, "2026-09-23");
assert.equal(swap0916?.partnerPeriodId, "p5");
assert.ok(!resolved.summary.unmatchedTeachers.includes("韓卓穎"));
assert.ok(resolved.summary.unmatchedTeachers.includes("劉嘉琪"));

const selfSwap = resolved.swaps.find((s) => s.leaveDate === "2026-09-07" && s.leaveTeacherId === "思");
assert.ok(selfSwap);
assert.equal(selfSwap?.partnerTeacherIds[0], "思");

const merged = mergeOfficialArrangementImport({ balances: {}, plans: [] }, [], resolved);
assert.equal(merged.plans.length, resolved.plans.length);
assert.equal(merged.swaps.length, resolved.swaps.length);
assert.ok(Object.keys(merged.balances).length > 0);

console.log(
  JSON.stringify(
    {
      rows: parsed.rows.length,
      emptyDates: parsed.emptyDates,
      duties: parsed.duties.length,
      ...resolved.summary,
      warnings: resolved.warnings,
      planDates: resolved.plans.map((p) => `${p.date}:${p.assignments.length}`),
      swapDates: resolved.swaps.map((s) => `${s.leaveDate} ${s.leaveTeacherName}→${s.partnerDate}`),
    },
    null,
    2,
  ),
);
console.log("official arrangements tests passed");
