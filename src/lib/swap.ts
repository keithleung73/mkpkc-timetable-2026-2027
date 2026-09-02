import { COVER_PERIOD_IDS, periodLabel as periodLabelFromConstants } from "./constants";
import { weekdayFromIsoDate } from "./cover";
import { classTokenMatches, substituteCandidates } from "./queries";
import type { DayId, Lesson, ScheduleData } from "./types";

export type SwapUnitKind = "normal" | "ial_bundle" | "elective_blocked";

export type SwapUnit = {
  id: string;
  kind: SwapUnitKind;
  leaveDate: string;
  day: DayId;
  periodId: string;
  lessons: Lesson[];
  teacherIds: string[];
  classIds: string[];
  subjects: string[];
  label: string;
};

export type SwapMatch = {
  partnerLessons: Lesson[];
  partnerDay: DayId;
  partnerPeriodId: string;
  partnerSubjects: string[];
  partnerTeacherNames: string[];
  reason: string;
};

export type CoverSuggestion = {
  teacherId: string;
  teacherName: string;
  teacherCode: string;
  sameSubject: boolean;
  teachesClass: boolean;
  lessonsToday: number;
};

export type SwapUnitResult = {
  unit: SwapUnit;
  status: "swap" | "cover" | "blocked";
  swap?: SwapMatch;
  coverSuggestions: CoverSuggestion[];
  blockers: string[];
};

export type SwapPlan = {
  teacherId: string;
  teacherName: string;
  leaveDates: string[];
  swapFromDate: string;
  results: SwapUnitResult[];
  summary: {
    total: number;
    swap: number;
    cover: number;
    blocked: number;
  };
};

function isTeaching(lesson: Lesson) {
  return (lesson.kind ?? "lesson") === "lesson";
}

function coverPeriods(day: DayId): string[] {
  if (day === "fri") return COVER_PERIOD_IDS.filter((id) => id !== "p9");
  return [...COVER_PERIOD_IDS];
}

function teacherName(data: ScheduleData, id: string) {
  return data.teachers.find((t) => t.id === id)?.name ?? id;
}

function lessonTeacherNames(data: ScheduleData, lessons: Lesson[]) {
  const ids = [...new Set(lessons.flatMap((l) => l.teacherIds))];
  return ids.map((id) => teacherName(data, id));
}

export function isIalClassId(classId: string) {
  const u = classId.toUpperCase();
  return u.includes("IAL") || u.endsWith("-IAL");
}

export function lessonHasIal(lesson: Lesson) {
  return (
    lesson.classIds.some(isIalClassId) ||
    /IAL/i.test(lesson.subject) ||
    Boolean(lesson.note && /IAL/i.test(lesson.note))
  );
}

export function parallelLessonsForClass(
  data: ScheduleData,
  day: DayId,
  periodId: string,
  classId: string,
): Lesson[] {
  return data.lessons.filter(
    (l) =>
      isTeaching(l) &&
      l.day === day &&
      l.periodId === periodId &&
      l.classIds.some(
        (cid) =>
          cid === classId || classTokenMatches(cid, classId) || classTokenMatches(classId, cid),
      ),
  );
}

export function ialBlockKey(lesson: Lesson): string | null {
  const ialClass = lesson.classIds.find(isIalClassId);
  if (!ialClass && !lessonHasIal(lesson)) return null;
  const classId = ialClass ?? lesson.classIds.find((c) => /IAL/i.test(c)) ?? lesson.classIds[0];
  if (!classId) return null;
  return `${lesson.day}|${lesson.periodId}|${classId}`;
}

export function ialBlockLessons(data: ScheduleData, lesson: Lesson): Lesson[] {
  const key = ialBlockKey(lesson);
  if (!key) return [lesson];
  const classId = key.split("|")[2]!;
  return parallelLessonsForClass(data, lesson.day, lesson.periodId, classId).filter(lessonHasIal);
}

/** 非 IAL 高中選修：同班同時段有其他分組課 → 不能單獨調堂 */
export function isBlockedElective(data: ScheduleData, lesson: Lesson): boolean {
  if (lessonHasIal(lesson)) return false;
  const marked = Boolean(lesson.note && lesson.note.includes("分組"));
  for (const classId of lesson.classIds) {
    const parallel = parallelLessonsForClass(data, lesson.day, lesson.periodId, classId);
    const others = parallel.filter((l) => l.id !== lesson.id);
    if (others.length === 0) continue;
    const electiveLike =
      marked ||
      others.some((l) => l.note?.includes("分組")) ||
      others.some((l) => l.subject !== lesson.subject);
    if (electiveLike) return true;
  }
  return false;
}

function unitFromLessons(
  data: ScheduleData,
  leaveDate: string,
  day: DayId,
  periodId: string,
  lessons: Lesson[],
  kind: SwapUnitKind,
): SwapUnit {
  const teacherIds = [...new Set(lessons.flatMap((l) => l.teacherIds))];
  const classIds = [...new Set(lessons.flatMap((l) => l.classIds))];
  const subjects = [...new Set(lessons.map((l) => l.subject))];
  const label =
    kind === "ial_bundle"
      ? `IAL 一拼調：${subjects.join("、")}`
      : `${subjects.join("、")}（${lessonTeacherNames(data, lessons).join("、")}）`;
  return {
    id: `${leaveDate}|${day}|${periodId}|${lessons
      .map((l) => l.id)
      .sort()
      .join("+")}`,
    kind,
    leaveDate,
    day,
    periodId,
    lessons,
    teacherIds,
    classIds,
    subjects,
    label,
  };
}

/** 請假老師喺請假日需要處理嘅調堂單位（IAL 自動成 bundle） */
export function buildLeaveUnits(
  data: ScheduleData,
  teacherId: string,
  leaveDates: string[],
): SwapUnit[] {
  const units: SwapUnit[] = [];
  const seen = new Set<string>();

  for (const leaveDate of [...new Set(leaveDates)].sort()) {
    const day = weekdayFromIsoDate(leaveDate);
    if (!day) continue;
    const periods = new Set(coverPeriods(day));
    const mine = data.lessons.filter(
      (l) =>
        isTeaching(l) &&
        l.day === day &&
        periods.has(l.periodId) &&
        l.teacherIds.includes(teacherId),
    );

    for (const lesson of mine) {
      if (lessonHasIal(lesson)) {
        const bundle = ialBlockLessons(data, lesson);
        const key = `ial|${leaveDate}|${lesson.day}|${lesson.periodId}|${bundle
          .map((l) => l.id)
          .sort()
          .join("+")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        units.push(unitFromLessons(data, leaveDate, day, lesson.periodId, bundle, "ial_bundle"));
        continue;
      }

      if (isBlockedElective(data, lesson)) {
        const key = `block|${lesson.id}|${leaveDate}`;
        if (seen.has(key)) continue;
        seen.add(key);
        units.push(
          unitFromLessons(data, leaveDate, day, lesson.periodId, [lesson], "elective_blocked"),
        );
        continue;
      }

      const key = `n|${lesson.id}|${leaveDate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      units.push(unitFromLessons(data, leaveDate, day, lesson.periodId, [lesson], "normal"));
    }
  }

  return units.sort(
    (a, b) =>
      a.leaveDate.localeCompare(b.leaveDate) ||
      coverPeriods(a.day).indexOf(a.periodId) - coverPeriods(b.day).indexOf(b.periodId),
  );
}

function weekdaySearchOrder(startDay: DayId): DayId[] {
  const order: DayId[] = ["mon", "tue", "wed", "thu", "fri"];
  const idx = order.indexOf(startDay);
  if (idx < 0) return order;
  return [...order.slice(idx), ...order.slice(0, idx)];
}

function classesOverlap(a: string[], b: string[]) {
  for (const x of a) {
    for (const y of b) {
      if (x === y || classTokenMatches(x, y) || classTokenMatches(y, x)) return true;
    }
  }
  return false;
}

function teacherFreeIgnoring(
  data: ScheduleData,
  teacherId: string,
  day: DayId,
  periodId: string,
  ignoreLessonIds: Set<string>,
) {
  if (periodId === "p9" && day === "fri") return true;
  return !data.lessons.some(
    (l) =>
      l.day === day &&
      l.periodId === periodId &&
      l.teacherIds.includes(teacherId) &&
      !ignoreLessonIds.has(l.id),
  );
}

function allTeachersFreeIgnoring(
  data: ScheduleData,
  teacherIds: string[],
  day: DayId,
  periodId: string,
  ignoreLessonIds: Set<string>,
) {
  return teacherIds.every((id) => teacherFreeIgnoring(data, id, day, periodId, ignoreLessonIds));
}

function findNormalSwap(
  data: ScheduleData,
  unit: SwapUnit,
  leaveTeacherId: string,
  leaveDaySet: Set<DayId>,
  searchDays: DayId[],
): SwapMatch | null {
  const lesson = unit.lessons[0];
  if (!lesson) return null;
  const ignoreMine = new Set(unit.lessons.map((l) => l.id));

  for (const day of searchDays) {
    if (leaveDaySet.has(day)) continue;
    for (const periodId of coverPeriods(day)) {
      if (day === unit.day && periodId === unit.periodId) continue;
      if (!teacherFreeIgnoring(data, leaveTeacherId, day, periodId, ignoreMine)) continue;

      const partners = data.lessons.filter(
        (l) =>
          isTeaching(l) &&
          l.day === day &&
          l.periodId === periodId &&
          classesOverlap(l.classIds, lesson.classIds) &&
          !l.teacherIds.includes(leaveTeacherId),
      );
      if (partners.length !== 1) continue;
      const partner = partners[0]!;
      if (isBlockedElective(data, partner) || lessonHasIal(partner)) continue;

      const ignorePartner = new Set([partner.id]);
      if (
        !allTeachersFreeIgnoring(data, partner.teacherIds, unit.day, unit.periodId, ignorePartner)
      ) {
        continue;
      }

      return {
        partnerLessons: [partner],
        partnerDay: day,
        partnerPeriodId: periodId,
        partnerSubjects: [partner.subject],
        partnerTeacherNames: lessonTeacherNames(data, [partner]),
        reason: `同班對調：${periodLabelFromConstants(unit.periodId)}（${unit.subjects.join("、")}）⇄ ${periodLabelFromConstants(periodId)}（${partner.subject}）`,
      };
    }
  }
  return null;
}

function findIalBundleSwap(
  data: ScheduleData,
  unit: SwapUnit,
  leaveTeacherId: string,
  leaveDaySet: Set<DayId>,
  searchDays: DayId[],
): SwapMatch | null {
  const seed = unit.lessons[0];
  if (!seed) return null;
  const ialClass =
    seed.classIds.find(isIalClassId) ?? seed.classIds.find((c) => /IAL/i.test(c)) ?? null;
  if (!ialClass) return null;

  const ignoreMine = new Set(unit.lessons.map((l) => l.id));
  const myTeachers = [...new Set(unit.lessons.flatMap((l) => l.teacherIds))];

  for (const day of searchDays) {
    if (leaveDaySet.has(day) && day !== unit.day) continue;
    for (const periodId of coverPeriods(day)) {
      if (day === unit.day && periodId === unit.periodId) continue;

      const partnerBundle = parallelLessonsForClass(data, day, periodId, ialClass).filter(
        lessonHasIal,
      );
      if (partnerBundle.length < 1) continue;
      if (partnerBundle.every((l) => ignoreMine.has(l.id))) continue;

      const partnerTeachers = [...new Set(partnerBundle.flatMap((l) => l.teacherIds))];
      const ignorePartner = new Set(partnerBundle.map((l) => l.id));

      if (!allTeachersFreeIgnoring(data, myTeachers, day, periodId, ignoreMine)) continue;
      if (
        !allTeachersFreeIgnoring(data, partnerTeachers, unit.day, unit.periodId, ignorePartner)
      ) {
        continue;
      }

      // 確保請假老師真係有份喺呢個 bundle（避免只係並行其他科）
      if (!myTeachers.includes(leaveTeacherId)) continue;

      return {
        partnerLessons: partnerBundle,
        partnerDay: day,
        partnerPeriodId: periodId,
        partnerSubjects: [...new Set(partnerBundle.map((l) => l.subject))],
        partnerTeacherNames: lessonTeacherNames(data, partnerBundle),
        reason: `IAL 整組對調：${unit.subjects.join("、")} ⇄ ${[
          ...new Set(partnerBundle.map((l) => l.subject)),
        ].join("、")}`,
      };
    }
  }
  return null;
}

function coverForUnit(
  data: ScheduleData,
  unit: SwapUnit,
  leaveTeacherId: string,
): CoverSuggestion[] {
  const out = new Map<string, CoverSuggestion>();
  for (const lesson of unit.lessons) {
    if (!lesson.teacherIds.includes(leaveTeacherId)) continue;
    const classId = lesson.classIds[0];
    const cands = substituteCandidates(data, unit.day, unit.periodId, {
      classId,
      subject: lesson.subject,
    }).filter((c) => c.teacher.id !== leaveTeacherId);

    for (const c of cands.slice(0, 6)) {
      const prev = out.get(c.teacher.id);
      if (
        !prev ||
        Number(c.sameSubject) + Number(c.teachesClass) >
          Number(prev.sameSubject) + Number(prev.teachesClass)
      ) {
        out.set(c.teacher.id, {
          teacherId: c.teacher.id,
          teacherName: c.teacher.name,
          teacherCode: c.teacher.code,
          sameSubject: c.sameSubject,
          teachesClass: c.teachesClass,
          lessonsToday: c.lessonsToday,
        });
      }
    }
  }
  return [...out.values()]
    .sort(
      (a, b) =>
        Number(b.sameSubject) - Number(a.sameSubject) ||
        Number(b.teachesClass) - Number(a.teachesClass) ||
        a.lessonsToday - b.lessonsToday ||
        a.teacherName.localeCompare(b.teacherName, "zh-Hant"),
    )
    .slice(0, 8);
}

export function planTeacherLeaveSwaps(
  data: ScheduleData,
  teacherId: string,
  leaveDates: string[],
  swapFromDate: string,
): SwapPlan {
  const teacher = data.teachers.find((t) => t.id === teacherId);
  const teacherName = teacher?.name ?? teacherId;
  const units = buildLeaveUnits(data, teacherId, leaveDates);
  const leaveDaySet = new Set(
    leaveDates.map(weekdayFromIsoDate).filter((d): d is DayId => Boolean(d)),
  );
  const startDay = weekdayFromIsoDate(swapFromDate) ?? "mon";
  const searchDays = weekdaySearchOrder(startDay);

  const results: SwapUnitResult[] = units.map((unit) => {
    if (unit.kind === "elective_blocked") {
      return {
        unit,
        status: "blocked" as const,
        coverSuggestions: coverForUnit(data, unit, teacherId),
        blockers: [
          "高中選修／分組時段：同一班同一時段仍有其他課（例如中史、歷史、企會財、化學等並行），不能單獨調堂。",
        ],
      };
    }

    const swap =
      unit.kind === "ial_bundle"
        ? findIalBundleSwap(data, unit, teacherId, leaveDaySet, searchDays)
        : findNormalSwap(data, unit, teacherId, leaveDaySet, searchDays);

    if (swap) {
      return {
        unit,
        status: "swap" as const,
        swap,
        coverSuggestions: [],
        blockers: [],
      };
    }

    const blockers =
      unit.kind === "ial_bundle"
        ? [
            "搵唔到可一拼對調嘅 IAL 選修時段（目標節要成組得閒，且請假老師唔喺其他請假日授課）。",
          ]
        : ["搵唔到同班可對調、而且雙方老師都得閒嘅節次。"];

    return {
      unit,
      status: "cover" as const,
      coverSuggestions: coverForUnit(data, unit, teacherId),
      blockers,
    };
  });

  return {
    teacherId,
    teacherName,
    leaveDates: [...new Set(leaveDates)].sort(),
    swapFromDate,
    results,
    summary: {
      total: results.length,
      swap: results.filter((r) => r.status === "swap").length,
      cover: results.filter((r) => r.status === "cover").length,
      blocked: results.filter((r) => r.status === "blocked").length,
    },
  };
}

export function periodLabel(periodId: string) {
  return periodLabelFromConstants(periodId);
}
