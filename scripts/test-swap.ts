import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eligibleCoverTeachers, generateCoverPlan, isOccupied, teachingLessonsOnDay } from "../src/lib/cover";
import { isFree } from "../src/lib/queries";
import { isNonRegularLesson, isRemedialLesson, lessonOccupiesTeacher } from "../src/lib/lesson-kind";
import { planTeacherLeaveSwaps } from "../src/lib/swap";
import {
  applyConfirmedSwaps,
  confirmedSwapManual,
  makeConfirmedSwap,
  confirmedSwapFromSuggestion,
  reviseConfirmedSwap,
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
      lesson("振-p1", "thu", "p1", "振", { classIds: ["2A"] }),
      lesson("振-p2", "thu", "p2", "振", { classIds: ["2B"] }),
      lesson("振-p3", "thu", "p3", "振", { classIds: ["2C"] }),
      lesson("振-p5", "thu", "p5", "振", { classIds: ["3A"] }),
      lesson("振-p6", "thu", "p6", "振", { classIds: ["3B"] }),
      lesson("振-2d", "thu", "p7", "振", { classIds: ["2D"], subject: "數學" }),
      lesson("振-p8", "thu", "p8", "振", { classIds: ["3C"] }),
      lesson("甲-p4", "thu", "p4", "甲", { classIds: ["1A"], subject: "英文", roomId: "201" }),
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
  const roomBlocked = confirmedSwapManual(live, {
    leaveTeacherId: "振",
    leaveDate: "2026-09-03",
    leavePeriodId: "p7",
    partnerDate: "2026-09-10",
    partnerPeriodId: "p4",
  });
  assert.ok("error" in roomBlocked, "305 星期四第四節有人用，不能調過去");
  if ("error" in roomBlocked) assert.match(roomBlocked.error, /課室/);

  const record = confirmedSwapManual(live, {
    leaveTeacherId: "振",
    leaveDate: "2026-09-03",
    leavePeriodId: "p7",
    partnerDate: "2026-09-04",
    partnerPeriodId: "p3",
  });
  assert.ok(!("error" in record), String((record as { error?: string }).error ?? ""));
  if ("error" in record) throw new Error(String(record.error));
  const onFri = applyConfirmedSwaps(live, "2026-09-04", [record]);
  assert.equal(isOccupied(onFri, "振", "fri", "p3"), true, "調去星期五第三節後該節有 2D 數學");
  assert.ok(
    onFri.lessons.some(
      (l) => l.periodId === "p3" && l.teacherIds.includes("振") && l.classIds.includes("2D"),
    ),
  );
  const plan = generateCoverPlan(onFri, "fri", "2026-09-04", ["曹"], {});
  assert.ok(
    !plan.assignments.some((a) => a.coverTeacherId === "振"),
    "曹思思 4/9 請假時，不應派陳振華代堂",
  );
  const p3Slot = plan.slots.find((s) => s.periodId === "p3" && s.teacherId === "曹");
  assert.ok(p3Slot, "曹思思星期五第三節有課需代");
  const p3Eligible = eligibleCoverTeachers(onFri, "fri", new Set(["曹"]), {}, p3Slot, []);
  assert.ok(!p3Eligible.some((x) => x.teacher.id === "振"), "第三節候選名單沒有陳振華");
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
  const 丙 = teacher("丙", "丙老師");
  const data = schedule(
    [振, 乙, 丙],
    [
      lesson("振-2d", "wed", "p5", "振", { classIds: ["2D"], subject: "數學", roomId: "305" }),
      lesson("乙-2d", "thu", "p1", "乙", { classIds: ["2D"], subject: "科學", roomId: "201" }),
      lesson("丙-2d", "fri", "p3", "丙", { classIds: ["2D"], subject: "英文", roomId: "301" }),
    ],
  );
  const plan = planTeacherLeaveSwaps(data, "振", ["2026-09-02"], "2026-09-02");
  const hit = plan.results.find((r) => r.unit.periodId === "p5");
  assert.equal(hit?.status, "swap");
  assert.ok((hit?.swaps?.length ?? 0) >= 2, "應列出多於一個可即時揀嘅調堂建議");
  const periods = new Set(hit?.swaps?.map((s) => s.partnerPeriodId));
  assert.ok(periods.has("p1") && periods.has("p3"));
}

{
  const rem = lesson("乙-rem", "thu", "p9", "乙", { classIds: ["2D"], subject: "重摘課" });
  assert.equal(isRemedialLesson(rem), true);
  const data = schedule(
    [振, 乙],
    [lesson("振-2d", "wed", "p5", "振", { classIds: ["2D"], subject: "數學" }), rem],
  );
  const plan = planTeacherLeaveSwaps(data, "振", ["2026-09-02"], "2026-09-02");
  const hit = plan.results.find((r) => r.unit.periodId === "p5");
  assert.ok(!(hit?.swaps ?? []).some((s) => s.partnerSubjects.includes("重摘課")));
  assert.notEqual(hit?.swap?.partnerPeriodId, "p9", "重摘課不能做調堂對手");

  const leaveRemedial = planTeacherLeaveSwaps(data, "乙", ["2026-09-03"], "2026-09-03");
  const remUnit = leaveRemedial.results.find((r) => r.unit.periodId === "p9");
  assert.equal(remUnit?.status, "blocked");
  assert.equal(remUnit?.unit.kind, "remedial_blocked");
  assert.ok(remUnit?.blockers.some((b) => b.includes("重摘課")));

  const manual = confirmedSwapManual(data, {
    leaveTeacherId: "振",
    leaveDate: "2026-09-02",
    leavePeriodId: "p5",
    partnerDate: "2026-09-03",
    partnerPeriodId: "p9",
    partnerTeacherId: "乙",
  });
  assert.ok("error" in manual, "人手對調重摘課應失敗");
  if ("error" in manual) assert.match(manual.error, /重摘課/);
}

{
  const live = JSON.parse(readFileSync("data/schedule.json", "utf8")) as ScheduleData;
  const plan = planTeacherLeaveSwaps(live, "振", ["2026-09-03"], "2026-09-03");
  for (const r of plan.results) {
    for (const s of r.swaps ?? (r.swap ? [r.swap] : [])) {
      assert.ok(
        !s.partnerSubjects.some((sub) => sub.includes("重摘課")),
        `正式課表不應建議對調重摘課：${r.unit.label} → ${s.partnerSubjects.join("、")}`,
      );
    }
  }
}

{
  const 丙 = teacher("丙", "丙老師");
  const data = schedule(
    [振, 乙, 丙],
    [
      lesson("振-2d", "wed", "p5", "振", { classIds: ["2D"], subject: "數學", roomId: "305" }),
      lesson("乙-2d", "thu", "p1", "乙", { classIds: ["2D"], subject: "科學", roomId: "201" }),
      lesson("丙-other", "thu", "p1", "丙", { classIds: ["1A"], subject: "英文", roomId: "305" }),
    ],
  );
  const blocked = planTeacherLeaveSwaps(data, "振", ["2026-09-02"], "2026-09-02");
  const hit = blocked.results.find((r) => r.unit.periodId === "p5" && r.unit.kind === "normal");
  assert.ok(
    !(hit?.swaps ?? []).some((s) => s.partnerPeriodId === "p1" && s.mode !== "clp"),
    "對手節課室已被佔用就不能調過去",
  );

  const free = schedule(
    [振, 乙],
    [
      lesson("振-2d", "wed", "p5", "振", { classIds: ["2D"], subject: "數學", roomId: "305" }),
      lesson("乙-2d", "thu", "p1", "乙", { classIds: ["2D"], subject: "科學", roomId: "201" }),
    ],
  );
  const ok = planTeacherLeaveSwaps(free, "振", ["2026-09-02"], "2026-09-02");
  const hitOk = ok.results.find((r) => r.unit.periodId === "p5" && r.unit.kind === "normal");
  assert.ok(hitOk?.swaps?.some((s) => s.partnerPeriodId === "p1"));
}

{
  const data = schedule(
    [振],
    [
      lesson("振-2d", "wed", "p5", "振", { classIds: ["2D"], subject: "數學" }),
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
  const plan = planTeacherLeaveSwaps(data, "振", ["2026-09-02"], "2026-09-02");
  const hit = plan.results.find((r) => r.unit.periodId === "p5" && r.unit.kind === "normal");
  assert.ok(hit?.swaps?.some((s) => s.mode === "clp"), "CLP 可以調堂");
}

{
  const 彤 = teacher("彤", "林紀彤");
  const 泰 = teacher("泰", "林至泰");
  const data = schedule(
    [彤, 泰],
    [
      lesson("pth", "tue", "p7", "彤", { classIds: ["1A"], subject: "普話", roomId: "201" }),
      lesson("drama", "tue", "p7", "泰", { classIds: ["1A"], subject: "戲劇", roomId: "513" }),
    ],
  );
  const plan = planTeacherLeaveSwaps(data, "彤", ["2026-09-08"], "2026-09-08");
  const hit = plan.results.find((r) => r.unit.periodId === "p7");
  const rotate = hit?.swaps?.find((s) => s.mode === "split_rotate");
  assert.ok(rotate, "普通話／戲劇應有對拆輪換建議");
  assert.equal(rotate?.partnerDate, "2026-09-15");
  assert.ok(rotate?.partnerTeacherIds.includes("泰"));

  const recorded = confirmedSwapFromSuggestion(
    data,
    "彤",
    "2026-09-08",
    "p7",
    [data.lessons[0]!],
    "2026-09-15",
    "tue",
    "p7",
    [data.lessons[1]!],
    "普通話／戲劇對拆",
    undefined,
    "split_rotate",
  );
  assert.ok(!("error" in recorded), String((recorded as { error?: string }).error ?? ""));
  if ("error" in recorded) throw new Error(recorded.error);
  const onLeave = applyConfirmedSwaps(data, "2026-09-08", [recorded]);
  assert.ok(!onLeave.lessons.some((l) => l.id === "pth"), "請假日只由戲劇老師上全班");
  assert.ok(onLeave.lessons.some((l) => l.id === "drama"));
  const onRepay = applyConfirmedSwaps(data, "2026-09-15", [recorded]);
  assert.ok(!onRepay.lessons.some((l) => l.id === "drama"), "下星期由請假老師上番全班");
  assert.ok(onRepay.lessons.some((l) => l.id === "pth"));
}

{
  const data = schedule(
    [振, 乙],
    [
      lesson("振-a", "wed", "p5", "振", { classIds: ["2D"], subject: "數學" }),
      lesson("振-b", "wed", "p6", "振", { classIds: ["2D"], subject: "數學" }),
      lesson("乙-a", "thu", "p1", "乙", { classIds: ["2D"], subject: "科學" }),
      lesson("乙-b", "thu", "p2", "乙", { classIds: ["2D"], subject: "科學" }),
    ],
  );
  const plan = planTeacherLeaveSwaps(data, "振", ["2026-09-02"], "2026-09-02");
  const pair = plan.results.find((r) => r.unit.kind === "subject_pair");
  assert.ok(pair, "同一科兩堂應成一組");
  assert.ok(pair?.swaps?.some((s) => s.mode === "subject_pair"));
}

{
  const live = JSON.parse(readFileSync("data/schedule.json", "utf8")) as ScheduleData;
  const plan = planTeacherLeaveSwaps(live, "彤", ["2026-09-08"], "2026-09-08");
  const p7 = plan.results.find((r) => r.unit.periodId === "p7" && r.unit.kind === "normal");
  assert.ok(
    p7?.swaps?.some((s) => s.mode === "split_rotate" && s.partnerTeacherIds.includes("泰")),
    "正式課表 1A 普通話／戲劇可對拆輪換",
  );
}

{
  const 丙 = teacher("丙", "丙老師");
  const data = schedule(
    [振, 乙, 丙],
    [
      lesson("振-2d", "wed", "p5", "振", { classIds: ["2D"], subject: "數學", roomId: "305" }),
      lesson("乙-2d", "thu", "p1", "乙", { classIds: ["2D"], subject: "科學", roomId: "201" }),
      lesson("丙-2d", "thu", "p1", "丙", { classIds: ["2D"], subject: "電腦", roomId: "N304" }),
    ],
  );
  const plan = planTeacherLeaveSwaps(data, "振", ["2026-09-02"], "2026-09-02");
  const hit = plan.results.find((r) => r.unit.periodId === "p5" && r.unit.kind === "normal");
  const multi = hit?.swaps?.find((s) => s.partnerPeriodId === "p1");
  assert.ok(multi, "複合調堂應容許多名老師");
  assert.ok(multi?.partnerTeacherIds.includes("乙") && multi?.partnerTeacherIds.includes("丙"));
  assert.match(multi?.reason ?? "", /複合/);
}

{
  const 萬 = teacher("萬", "萬老師");
  const data = schedule(
    [萬],
    [
      lesson("c1", "thu", "p1", "萬", { classIds: ["4A"], subject: "中文", roomId: "406" }),
      lesson("c2", "thu", "p2", "萬", { classIds: ["4A"], subject: "中文", roomId: "406" }),
      lesson("c3", "thu", "p3", "萬", { classIds: ["4A"], subject: "中文", roomId: "406" }),
      lesson("c4", "wed", "p5", "萬", { classIds: ["4A"], subject: "中文", roomId: "406" }),
    ],
  );
  const blocked = confirmedSwapManual(data, {
    leaveTeacherId: "萬",
    leaveDate: "2026-09-02",
    leavePeriodId: "p5",
    partnerDate: "2026-09-03",
    partnerPeriodId: "p4",
  });
  assert.ok("error" in blocked, "調堂後 4A 星期四不能有 4 堂中文");
  if ("error" in blocked) {
    assert.match(blocked.error, /4A/);
    assert.match(blocked.error, /中文/);
  }

  const ok = confirmedSwapManual(data, {
    leaveTeacherId: "萬",
    leaveDate: "2026-09-02",
    leavePeriodId: "p5",
    partnerDate: "2026-09-04",
    partnerPeriodId: "p3",
  });
  assert.ok(!("error" in ok), String((ok as { error?: string }).error ?? "4A 中文調去未滿 4 堂嘅日子應成功"));
}

{
  const live = JSON.parse(readFileSync("data/schedule.json", "utf8")) as ScheduleData;
  const plan = planTeacherLeaveSwaps(live, "振", ["2026-09-03"], "2026-09-03");
  const twoE = plan.results.find((r) => r.unit.periodId === "p3" && r.unit.kind === "normal");
  assert.ok(
    !(twoE?.swaps ?? []).some((s) => s.mode === "clp"),
    "2E 星期三已有 3 堂數學，不能再調去當日 CLP",
  );
  const pair12 = plan.results.find((r) => r.unit.kind === "subject_pair" && r.unit.periodId === "p1");
  assert.ok(
    !(pair12?.swaps ?? []).some((s) => s.partnerTeacherIds.includes("蕭")),
    "2E 數學連堂對調中文後星期四會有 4 堂中文，不能建議",
  );
  const pair = plan.results.find((r) => r.unit.kind === "subject_pair" && r.unit.periodId === "p7");
  assert.ok(pair, "2D 數學第七、八節應成同一科兩堂");

  const tong = planTeacherLeaveSwaps(live, "彤", ["2026-09-08"], "2026-09-08");
  assert.ok(
    tong.results.some((r) => (r.swaps ?? []).some((s) => s.mode === "clp")),
    "正式課表 CLP 可以調堂（1A 普通話調去星期三 CLP）",
  );
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

{
  const data = schedule([振], [lesson("振-p7", "thu", "p7", "振")]);
  const created = confirmedSwapManual(data, {
    leaveTeacherId: "振",
    leaveDate: "2026-09-03",
    leavePeriodId: "p7",
    partnerDate: "2026-09-10",
    partnerPeriodId: "p4",
  });
  assert.ok(!("error" in created));
  if ("error" in created) throw new Error(created.error);
  const revised = reviseConfirmedSwap(data, [created], created.id, {
    leaveTeacherId: "振",
    leaveDate: "2026-09-03",
    leavePeriodId: "p7",
    partnerDate: "2026-09-17",
    partnerPeriodId: "p4",
  });
  assert.ok(!("error" in revised));
  if ("error" in revised) throw new Error(revised.error);
  assert.equal(revised.saved.id, created.id, "修改應沿用原紀錄 id");
  assert.equal(revised.saved.partnerDate, "2026-09-17");
  assert.equal(revised.swaps.length, 1);

  const blocked = reviseConfirmedSwap(data, [created], created.id, {
    leaveTeacherId: "振",
    leaveDate: "2026-09-03",
    leavePeriodId: "p7",
    partnerDate: "2026-10-01",
    partnerPeriodId: "p4",
  });
  assert.ok("error" in blocked);
  assert.match(String(blocked.error), /國慶日/);

  const missing = reviseConfirmedSwap(data, [created], "swap-not-exist", {
    leaveTeacherId: "振",
    leaveDate: "2026-09-03",
    leavePeriodId: "p7",
    partnerDate: "2026-09-17",
    partnerPeriodId: "p4",
  });
  assert.ok("error" in missing);
}

console.log("swap / CLP / confirmed timetable ok");
