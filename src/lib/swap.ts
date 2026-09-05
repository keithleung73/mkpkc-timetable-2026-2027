import {
  COVER_PERIOD_IDS,
  isCoreSubject,
  periodLabel as periodLabelFromConstants,
} from "./constants";
import { addDaysIso, weekdayFromIsoDate } from "./cover";
import { isClpSubject, isRemedialLesson, isTeachingLesson, lessonOccupiesTeacher } from "./lesson-kind";
import { classTokenMatches, substituteCandidates } from "./queries";
import { schoolClosedReason, swapBlockedReason } from "./school-calendar";
import { resolveDateForWeekday, swapSearchDates } from "./swap-records";
import {
  adjacentPeriodPairs,
  isPthDramaPair,
  roomsFreeForMove,
  splitRotatePartnerSubject,
  subjectKey,
  swapExceedsClassSubjectDayCap,
  teacherHasOnlyClpOrFree,
  type SwapMode,
  type SwapPeriodPair,
} from "./swap-rules";
import type { DayId, Lesson, ScheduleData } from "./types";

export { isCoreSubject };

export type SwapUnitKind =
  | "normal"
  | "ial_bundle"
  | "elective_blocked"
  | "remedial_blocked"
  | "subject_pair";

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
  partnerDate: string;
  partnerPeriodId: string;
  partnerSubjects: string[];
  partnerTeacherIds: string[];
  partnerTeacherNames: string[];
  reason: string;
  mode?: SwapMode;
  periodPairs?: SwapPeriodPair[];
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
  /** 可即時揀嘅對調建議（第一個即 swap） */
  swaps?: SwapMatch[];
  coverSuggestions: CoverSuggestion[];
  blockers: string[];
};

const MAX_SWAP_OPTIONS = 6;

export type SwapPlan = {
  teacherId: string;
  teacherName: string;
  leaveDates: string[];
  swapFromDate: string;
  notes: string[];
  results: SwapUnitResult[];
  summary: {
    total: number;
    swap: number;
    cover: number;
    blocked: number;
  };
};

function isTeaching(lesson: Lesson) {
  return isTeachingLesson(lesson);
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

/** 非 IAL 高中選修：本身係分組／選修課，且同班同時段有其他分組課 → 不能單獨調堂 */
export function isBlockedElective(data: ScheduleData, lesson: Lesson): boolean {
  if (lessonHasIal(lesson)) return false;
  // 核心科（例如公民科）唔係選修，唔好因為同時段有選修資料就鎖死調堂
  if (isCoreSubject(lesson.subject)) return false;
  // 只封鎖「本身」標咗分組／選修嘅課；無標記嘅課唔應被並行選修連坐
  const marked = Boolean(lesson.note && lesson.note.includes("分組"));
  if (!marked) return false;
  for (const classId of lesson.classIds) {
    const parallel = parallelLessonsForClass(data, lesson.day, lesson.periodId, classId);
    const others = parallel.filter((l) => l.id !== lesson.id && !isCoreSubject(l.subject));
    if (others.length === 0) continue;
    const electiveLike =
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
      : kind === "subject_pair"
        ? `同一科兩堂：${subjects.join("、")} ${periodLabelFromConstants(lessons[0]?.periodId ?? periodId)}＋${periodLabelFromConstants(lessons[1]?.periodId ?? periodId)}`
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
    if (schoolClosedReason(leaveDate)) continue;
    const periods = new Set(coverPeriods(day));
    const mine = data.lessons.filter(
      (l) =>
        isTeaching(l) &&
        l.day === day &&
        periods.has(l.periodId) &&
        l.teacherIds.includes(teacherId),
    );

    for (const lesson of mine) {
      if (isRemedialLesson(lesson)) {
        const key = `remedial|${lesson.id}|${leaveDate}`;
        if (seen.has(key)) continue;
        seen.add(key);
        units.push(
          unitFromLessons(data, leaveDate, day, lesson.periodId, [lesson], "remedial_blocked"),
        );
        continue;
      }

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

    const pairable = mine
      .filter(
        (l) =>
          l.teacherIds.includes(teacherId) &&
          !isRemedialLesson(l) &&
          !lessonHasIal(l) &&
          !isBlockedElective(data, l),
      )
      .sort((a, b) => coverPeriods(day).indexOf(a.periodId) - coverPeriods(day).indexOf(b.periodId));
    const usedPair = new Set<string>();
    for (let i = 0; i < pairable.length - 1; i++) {
      const a = pairable[i]!;
      const b = pairable[i + 1]!;
      if (usedPair.has(a.id) || usedPair.has(b.id)) continue;
      const ai = coverPeriods(day).indexOf(a.periodId);
      const bi = coverPeriods(day).indexOf(b.periodId);
      if (bi !== ai + 1) continue;
      if (subjectKey(a.subject) !== subjectKey(b.subject)) continue;
      if (!classesOverlap(a.classIds, b.classIds)) continue;
      const key = `pair|${leaveDate}|${a.id}+${b.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      usedPair.add(a.id);
      usedPair.add(b.id);
      units.push(unitFromLessons(data, leaveDate, day, a.periodId, [a, b], "subject_pair"));
    }
  }

  return units.sort(
    (a, b) =>
      a.leaveDate.localeCompare(b.leaveDate) ||
      coverPeriods(a.day).indexOf(a.periodId) - coverPeriods(b.day).indexOf(b.periodId),
  );
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
      !ignoreLessonIds.has(l.id) &&
      lessonOccupiesTeacher(l),
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

function pushMatch(
  matches: SwapMatch[],
  seen: Set<string>,
  key: string,
  match: SwapMatch,
): boolean {
  if (seen.has(key)) return false;
  seen.add(key);
  matches.push(match);
  return matches.length >= MAX_SWAP_OPTIONS;
}

function findNormalSwaps(
  data: ScheduleData,
  unit: SwapUnit,
  leaveTeacherId: string,
  searchDates: string[],
): SwapMatch[] {
  const lesson = unit.lessons[0];
  if (!lesson) return [];
  const ignoreMine = new Set(unit.lessons.map((l) => l.id));
  const matches: SwapMatch[] = [];
  const seen = new Set<string>();

  for (const partnerDate of searchDates) {
    const day = weekdayFromIsoDate(partnerDate);
    if (!day) continue;
    const sameWeekdayOtherDate = day === unit.day && partnerDate !== unit.leaveDate;
    const ignoreLeaveOnPartnerDay = sameWeekdayOtherDate ? new Set<string>() : ignoreMine;

    for (const periodId of coverPeriods(day)) {
      if (partnerDate === unit.leaveDate && periodId === unit.periodId) continue;
      if (!teacherFreeIgnoring(data, leaveTeacherId, day, periodId, ignoreLeaveOnPartnerDay)) {
        continue;
      }

      const partners = data.lessons.filter(
        (l) =>
          isTeaching(l) &&
          l.day === day &&
          l.periodId === periodId &&
          classesOverlap(l.classIds, lesson.classIds) &&
          !l.teacherIds.includes(leaveTeacherId) &&
          !isRemedialLesson(l) &&
          !lessonHasIal(l) &&
          !isBlockedElective(data, l),
      );
      if (partners.length > 0 && !isPthDramaPair(partners)) {
        const ignoreBoth = new Set([...ignoreLeaveOnPartnerDay, ...partners.map((l) => l.id)]);
        const partnerTeachers = [...new Set(partners.flatMap((l) => l.teacherIds))];
        if (
          allTeachersFreeIgnoring(data, partnerTeachers, unit.day, unit.periodId, new Set(partners.map((l) => l.id))) &&
          roomsFreeForMove(data, unit.lessons, day, periodId, ignoreBoth) &&
          roomsFreeForMove(data, partners, unit.day, unit.periodId, ignoreBoth) &&
          !swapExceedsClassSubjectDayCap(data, unit.day, day, unit.lessons, partners, [
            { leavePeriodId: unit.periodId, partnerPeriodId: periodId },
          ])
        ) {
          const multi = partnerTeachers.length > 1 || partners.length > 1;
          const key = `${partnerDate}|${periodId}|${partners
            .map((l) => l.id)
            .sort()
            .join("+")}`;
          if (
            pushMatch(matches, seen, key, {
              partnerLessons: partners,
              partnerDay: day,
              partnerDate,
              partnerPeriodId: periodId,
              partnerSubjects: [...new Set(partners.map((l) => l.subject))],
              partnerTeacherIds: partnerTeachers,
              partnerTeacherNames: lessonTeacherNames(data, partners),
              mode: "period",
              reason: multi
                ? `複合調堂（${partnerTeachers.length} 位老師）：${periodLabelFromConstants(unit.periodId)}（${unit.subjects.join("、")}）⇄ ${periodLabelFromConstants(periodId)}（${[...new Set(partners.map((l) => l.subject))].join("、")}）`
                : `同班對調：${periodLabelFromConstants(unit.periodId)}（${unit.subjects.join("、")}）⇄ ${periodLabelFromConstants(periodId)}（${partners[0]!.subject}）`,
            })
          ) {
            return matches;
          }
        }
      }

      const clpHere = data.lessons.filter(
        (l) =>
          l.day === day &&
          l.periodId === periodId &&
          l.teacherIds.includes(leaveTeacherId) &&
          isClpSubject(l.subject),
      );
      if (
        clpHere.length > 0 &&
        teacherHasOnlyClpOrFree(data, leaveTeacherId, day, periodId, ignoreLeaveOnPartnerDay) &&
        roomsFreeForMove(data, unit.lessons, day, periodId, ignoreLeaveOnPartnerDay) &&
        !swapExceedsClassSubjectDayCap(data, unit.day, day, unit.lessons, [], [
          { leavePeriodId: unit.periodId, partnerPeriodId: periodId },
        ])
      ) {
        const key = `${partnerDate}|${periodId}|clp`;
        if (
          pushMatch(matches, seen, key, {
            partnerLessons: clpHere,
            partnerDay: day,
            partnerDate,
            partnerPeriodId: periodId,
            partnerSubjects: ["CLP"],
            partnerTeacherIds: [leaveTeacherId],
            partnerTeacherNames: [teacherName(data, leaveTeacherId)],
            mode: "clp",
            reason: `調往 CLP：${periodLabelFromConstants(unit.periodId)}（${unit.subjects.join("、")}）→ ${periodLabelFromConstants(periodId)} CLP`,
          })
        ) {
          return matches;
        }
      }
    }
  }
  return matches;
}

function findSplitRotateSwap(
  data: ScheduleData,
  unit: SwapUnit,
  leaveTeacherId: string,
): SwapMatch | null {
  const lesson = unit.lessons.find((l) => l.teacherIds.includes(leaveTeacherId));
  if (!lesson) return null;
  const want = splitRotatePartnerSubject(lesson.subject);
  if (!want) return null;
  const partner = data.lessons.find(
    (l) =>
      isTeaching(l) &&
      l.day === unit.day &&
      l.periodId === unit.periodId &&
      l.id !== lesson.id &&
      classesOverlap(l.classIds, lesson.classIds) &&
      subjectKey(l.subject) === want,
  );
  if (!partner) return null;
  const nextDate = resolveDateForWeekday(addDaysIso(unit.leaveDate, 1), unit.day, [unit.leaveDate]);
  if (!nextDate) return null;
  return {
    partnerLessons: [partner],
    partnerDay: unit.day,
    partnerDate: nextDate,
    partnerPeriodId: unit.periodId,
    partnerSubjects: [partner.subject],
    partnerTeacherIds: [...partner.teacherIds],
    partnerTeacherNames: lessonTeacherNames(data, [partner]),
    mode: "split_rotate",
    reason: `普通話／戲劇對拆：今個星期由${lessonTeacherNames(data, [partner]).join("、")}上全班；下星期（${nextDate}）由請假老師上番全班`,
  };
}

function findSubjectPairSwaps(
  data: ScheduleData,
  unit: SwapUnit,
  leaveTeacherId: string,
  searchDates: string[],
): SwapMatch[] {
  if (unit.lessons.length !== 2) return [];
  const [first, second] = unit.lessons;
  if (!first || !second) return [];
  const ignoreMine = new Set(unit.lessons.map((l) => l.id));
  const matches: SwapMatch[] = [];
  const seen = new Set<string>();

  for (const partnerDate of searchDates) {
    const day = weekdayFromIsoDate(partnerDate);
    if (!day) continue;
    const sameWeekdayOtherDate = day === unit.day && partnerDate !== unit.leaveDate;
    const ignoreLeaveOnPartnerDay = sameWeekdayOtherDate ? new Set<string>() : ignoreMine;

    for (const [pa, pb] of adjacentPeriodPairs(day)) {
      if (partnerDate === unit.leaveDate && pa === first.periodId && pb === second.periodId) {
        continue;
      }
      if (!teacherFreeIgnoring(data, leaveTeacherId, day, pa, ignoreLeaveOnPartnerDay)) continue;
      if (!teacherFreeIgnoring(data, leaveTeacherId, day, pb, ignoreLeaveOnPartnerDay)) continue;

      const partnersA = data.lessons.filter(
        (l) =>
          isTeaching(l) &&
          l.day === day &&
          l.periodId === pa &&
          classesOverlap(l.classIds, first.classIds) &&
          !l.teacherIds.includes(leaveTeacherId) &&
          !isRemedialLesson(l),
      );
      const partnersB = data.lessons.filter(
        (l) =>
          isTeaching(l) &&
          l.day === day &&
          l.periodId === pb &&
          classesOverlap(l.classIds, second.classIds) &&
          !l.teacherIds.includes(leaveTeacherId) &&
          !isRemedialLesson(l),
      );
      if (partnersA.length < 1 || partnersB.length < 1) continue;
      if (isPthDramaPair([...partnersA, ...partnersB])) continue;

      const partners = [...partnersA, ...partnersB];
      const ignoreBoth = new Set([...ignoreLeaveOnPartnerDay, ...partners.map((l) => l.id)]);
      const partnerTeachers = [...new Set(partners.flatMap((l) => l.teacherIds))];
      const teachersA = [...new Set(partnersA.flatMap((l) => l.teacherIds))];
      const teachersB = [...new Set(partnersB.flatMap((l) => l.teacherIds))];
      if (
        !allTeachersFreeIgnoring(data, teachersA, unit.day, first.periodId, new Set(partnersA.map((l) => l.id)))
      ) {
        continue;
      }
      if (
        !allTeachersFreeIgnoring(data, teachersB, unit.day, second.periodId, new Set(partnersB.map((l) => l.id)))
      ) {
        continue;
      }
      if (!roomsFreeForMove(data, [first], day, pa, ignoreBoth)) continue;
      if (!roomsFreeForMove(data, [second], day, pb, ignoreBoth)) continue;
      if (!roomsFreeForMove(data, partnersA, unit.day, first.periodId, ignoreBoth)) continue;
      if (!roomsFreeForMove(data, partnersB, unit.day, second.periodId, ignoreBoth)) continue;
      if (
        swapExceedsClassSubjectDayCap(data, unit.day, day, unit.lessons, partners, [
          { leavePeriodId: first.periodId, partnerPeriodId: pa },
          { leavePeriodId: second.periodId, partnerPeriodId: pb },
        ])
      ) {
        continue;
      }

      const key = `${partnerDate}|${pa}+${pb}|${partners
        .map((l) => l.id)
        .sort()
        .join("+")}`;
      const multi = partnerTeachers.length > 1;
      if (
        pushMatch(matches, seen, key, {
          partnerLessons: partners,
          partnerDay: day,
          partnerDate,
          partnerPeriodId: pa,
          partnerSubjects: [...new Set(partners.map((l) => l.subject))],
          partnerTeacherIds: partnerTeachers,
          partnerTeacherNames: lessonTeacherNames(data, partners),
          mode: "subject_pair",
          periodPairs: [
            { leavePeriodId: first.periodId, partnerPeriodId: pa },
            { leavePeriodId: second.periodId, partnerPeriodId: pb },
          ],
          reason: `${multi ? "複合" : ""}同一科兩堂：${periodLabelFromConstants(first.periodId)}＋${periodLabelFromConstants(second.periodId)}（${unit.subjects.join("、")}）⇄ ${periodLabelFromConstants(pa)}＋${periodLabelFromConstants(pb)}（${[...new Set(partners.map((l) => l.subject))].join("、")}）`,
        })
      ) {
        return matches;
      }
    }
  }
  return matches;
}

function findIalBundleSwaps(
  data: ScheduleData,
  unit: SwapUnit,
  leaveTeacherId: string,
  searchDates: string[],
): SwapMatch[] {
  const seed = unit.lessons[0];
  if (!seed) return [];
  const ialClass =
    seed.classIds.find(isIalClassId) ?? seed.classIds.find((c) => /IAL/i.test(c)) ?? null;
  if (!ialClass) return [];

  const ignoreMine = new Set(unit.lessons.map((l) => l.id));
  const myTeachers = [...new Set(unit.lessons.flatMap((l) => l.teacherIds))];
  const matches: SwapMatch[] = [];
  const seen = new Set<string>();

  for (const partnerDate of searchDates) {
    const day = weekdayFromIsoDate(partnerDate);
    if (!day) continue;
    const sameWeekdayOtherDate = day === unit.day && partnerDate !== unit.leaveDate;
    const ignoreLeaveOnPartnerDay = sameWeekdayOtherDate ? new Set<string>() : ignoreMine;

    for (const periodId of coverPeriods(day)) {
      if (partnerDate === unit.leaveDate && periodId === unit.periodId) continue;

      const partnerBundle = parallelLessonsForClass(data, day, periodId, ialClass).filter(
        lessonHasIal,
      );
      if (partnerBundle.length < 1) continue;
      if (partnerBundle.some(isRemedialLesson)) continue;
      if (partnerBundle.every((l) => ignoreLeaveOnPartnerDay.has(l.id))) continue;

      const partnerTeachers = [...new Set(partnerBundle.flatMap((l) => l.teacherIds))];
      const ignorePartner = new Set(partnerBundle.map((l) => l.id));

      if (!allTeachersFreeIgnoring(data, myTeachers, day, periodId, ignoreLeaveOnPartnerDay)) {
        continue;
      }
      if (
        !allTeachersFreeIgnoring(data, partnerTeachers, unit.day, unit.periodId, ignorePartner)
      ) {
        continue;
      }
      const ignoreBoth = new Set([...ignoreLeaveOnPartnerDay, ...partnerBundle.map((l) => l.id)]);
      if (!roomsFreeForMove(data, unit.lessons, day, periodId, ignoreBoth)) continue;
      if (!roomsFreeForMove(data, partnerBundle, unit.day, unit.periodId, ignoreBoth)) continue;
      if (
        swapExceedsClassSubjectDayCap(data, unit.day, day, unit.lessons, partnerBundle, [
          { leavePeriodId: unit.periodId, partnerPeriodId: periodId },
        ])
      ) {
        continue;
      }

      // 確保請假老師真係有份喺呢個 bundle（避免只係並行其他科）
      if (!myTeachers.includes(leaveTeacherId)) continue;

      const key = `${partnerDate}|${periodId}|${partnerBundle
        .map((l) => l.id)
        .sort()
        .join("+")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({
        partnerLessons: partnerBundle,
        partnerDay: day,
        partnerDate,
        partnerPeriodId: periodId,
        partnerSubjects: [...new Set(partnerBundle.map((l) => l.subject))],
        partnerTeacherIds: partnerTeachers,
        partnerTeacherNames: lessonTeacherNames(data, partnerBundle),
        reason: `IAL 整組對調：${unit.subjects.join("、")} ⇄ ${[
          ...new Set(partnerBundle.map((l) => l.subject)),
        ].join("、")}`,
      });
      if (matches.length >= MAX_SWAP_OPTIONS) return matches;
    }
  }
  return matches;
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
  const uniqueLeave = [...new Set(leaveDates)].sort();
  const notes: string[] = [];
  const teachingLeave: string[] = [];
  for (const date of uniqueLeave) {
    const closed = schoolClosedReason(date);
    if (closed) {
      notes.push(`${date} ${closed}，無需調堂及代堂。`);
      continue;
    }
    teachingLeave.push(date);
  }
  const units = buildLeaveUnits(data, teacherId, teachingLeave);
  const searchDates = swapSearchDates(swapFromDate, leaveDates);

  const results: SwapUnitResult[] = units.map((unit) => {
    const calendarBlock = swapBlockedReason(unit.leaveDate);
    if (calendarBlock) {
      return {
        unit,
        status: "blocked" as const,
        coverSuggestions: coverForUnit(data, unit, teacherId),
        blockers: [calendarBlock],
      };
    }

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

    if (unit.kind === "remedial_blocked") {
      return {
        unit,
        status: "blocked" as const,
        coverSuggestions: coverForUnit(data, unit, teacherId),
        blockers: ["重摘課不能調堂。"],
      };
    }

    if (unit.kind === "subject_pair") {
      const pairSwaps = findSubjectPairSwaps(data, unit, teacherId, searchDates);
      if (pairSwaps.length > 0) {
        return {
          unit,
          status: "swap" as const,
          swap: pairSwaps[0],
          swaps: pairSwaps,
          coverSuggestions: [],
          blockers: [],
        };
      }
      return {
        unit,
        status: "cover" as const,
        coverSuggestions: coverForUnit(data, unit, teacherId),
        blockers: ["搵唔到可一拼對調嘅同一科兩堂（對方連堂、雙方得閒、課室無人用）。"],
      };
    }

    const found =
      unit.kind === "ial_bundle"
        ? findIalBundleSwaps(data, unit, teacherId, searchDates)
        : findNormalSwaps(data, unit, teacherId, searchDates);
    const rotate = unit.kind === "normal" ? findSplitRotateSwap(data, unit, teacherId) : null;
    const swaps = rotate ? [rotate, ...found].slice(0, MAX_SWAP_OPTIONS) : found;

    if (swaps.length > 0) {
      return {
        unit,
        status: "swap" as const,
        swap: swaps[0],
        swaps,
        coverSuggestions: coverForUnit(data, unit, teacherId),
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
    leaveDates: uniqueLeave,
    swapFromDate,
    notes,
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
