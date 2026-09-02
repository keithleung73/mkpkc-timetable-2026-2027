import type { DayId, Lesson, Room, ScheduleData, SchoolClass, Teacher } from "./types";
import { SCHOOL_NAME, SCHOOL_NAME_EN, SCHOOL_YEAR } from "./constants";

type RawTeacher = {
  name: string;
  code: string;
  subjects: string[];
  englishName?: string;
};

const RAW_TEACHERS: RawTeacher[] = [
  { name: "吳諾文", code: "文", subjects: ["經濟"] },
  { name: "陳紀筠", code: "筠", subjects: ["英國語文"] },
  { name: "鄧鵠耀", code: "鵠", subjects: ["公民經濟與社會", "公民與社會發展"] },
  { name: "黃詠淇", code: "詠", subjects: ["英國語文", "應用學習"] },
  { name: "朱會強", code: "會", subjects: ["地理"] },
  { name: "陳珮儀", code: "珮", subjects: ["數學", "經濟"] },
  { name: "黃俊偉", code: "俊", subjects: ["資訊及通訊科技", "電腦", "應用學習"] },
  { name: "陳梃浠", code: "浠", subjects: ["科學", "物理"] },
  { name: "徐治文", code: "徐", subjects: ["科學", "生物"] },
  { name: "范曦文", code: "范", subjects: ["歷史", "LCL", "應用學習"] },
  { name: "黃麗娜", code: "娜", subjects: ["歷史", "LCL"] },
  { name: "黃栢君", code: "君", subjects: ["體育"] },
  { name: "鄭敬宏", code: "宏", subjects: ["數學", "經濟"] },
  { name: "黃轉鳳", code: "鳳", subjects: ["公民經濟與社會"] },
  { name: "何慧欣", code: "慧", subjects: ["科學", "生物"] },
  { name: "張思華", code: "思", subjects: ["科學", "生物"] },
  { name: "曹思思", code: "曹", subjects: ["公民經濟與社會", "公民與社會發展"] },
  { name: "黃子毅", code: "毅", subjects: ["數學"] },
  { name: "歐陽佩霞", code: "霞", subjects: ["中國語文"] },
  { name: "劉麗芳", code: "芳", subjects: ["中國語文"] },
  { name: "黃守宏", code: "守", subjects: ["物理"] },
  { name: "黃天異", code: "異", subjects: ["中國語文"] },
  { name: "陳秋雲", code: "秋", subjects: ["中國語文", "應用學習"] },
  { name: "廖淑君", code: "廖", subjects: ["英國語文"] },
  { name: "羅祉臻", code: "臻", subjects: ["生物"] },
  { name: "馮耀强", code: "强", subjects: ["公民與社會發展", "企會財"] },
  { name: "陳浩云", code: "云", subjects: ["數學", "化學"] },
  { name: "林子華", code: "華", subjects: ["中國語文", "應用學習"] },
  { name: "范嘉楊", code: "NIC", subjects: ["數學", "應用學習"] },
  { name: "丘健", code: "丘", subjects: ["電腦", "資訊及通訊科技", "應用學習"] },
  { name: "郭家銘", code: "銘", subjects: ["英國語文", "LCL", "應用學習"] },
  { name: "劉以皓", code: "皓", subjects: ["視覺藝術"] },
  { name: "劉倩慈", code: "慈", subjects: ["英國語文", "音樂"] },
  { name: "周柏言", code: "言", subjects: ["數學"] },
  { name: "韓卓穎", code: "韓", subjects: ["英國語文"] },
  { name: "李日東", code: "日", subjects: ["英國語文"] },
  { name: "雷俊曜", code: "曜", subjects: ["科學", "化學"] },
  { name: "盧澤境", code: "境", subjects: ["數學", "物理"] },
  { name: "陳艷芬", code: "艷", subjects: ["視覺藝術", "應用學習"] },
  { name: "張允樂", code: "樂", subjects: ["音樂"] },
  { name: "陳振華", code: "振", subjects: ["數學", "企會財"] },
  { name: "林紀彤", code: "彤", subjects: ["中國語文", "普通話"] },
  { name: "袁德璋", code: "璋", subjects: ["數學"] },
  { name: "Dari", code: "DARI", subjects: ["英國語文"], englishName: "DARI, Mustafa" },
  { name: "Wayne", code: "WAY", subjects: ["英國語文"], englishName: "VAN DER MERWE, Wayne" },
  { name: "Roisin", code: "ROIS", subjects: ["英國語文", "LCL"], englishName: "FLYNN, Roisin Marie" },
  { name: "Raman", code: "KAUR", subjects: ["英國語文"], englishName: "KAUR, Ramandeep" },
  { name: "Scott", code: "SCOT", subjects: ["英國語文"], englishName: "WILDGEN, SCOTT ROBERT" },
  { name: "Wang", code: "WANG", subjects: ["數學"], englishName: "WANG, HEUMIL" },
  { name: "Mirza", code: "MIRZ", subjects: ["科學", "化學"], englishName: "BAIG, Mirza Muhammad Faran Ashraf" },
  { name: "Johan", code: "JOH", subjects: ["英國語文"], englishName: "KAMPER, Johan Herman" },
  { name: "萬嘉傑", code: "萬", subjects: ["中國語文"] },
  { name: "馬穎嫻", code: "嫻", subjects: ["地理"] },
  { name: "馬嘉雯", code: "嘉", subjects: ["中國歷史", "LCL", "應用學習"] },
  { name: "鄧嶧碖", code: "碖", subjects: ["企會財"] },
  { name: "蕭潤貞", code: "蕭", subjects: ["中國語文"] },
  { name: "陳淑真", code: "真", subjects: ["英國語文"] },
  { name: "黃子傑", code: "傑", subjects: ["體育"] },
  { name: "梁康姬", code: "康", subjects: ["英國語文"] },
  { name: "林至泰", code: "泰", subjects: ["戲劇", "應用學習"] },
  { name: "陳家仁", code: "仁", subjects: ["中國語文", "普通話"] },
  { name: "姚嘉宏", code: "姚", subjects: ["數學"] },
  { name: "陳曼湖", code: "湖", subjects: ["英國語文"] },
  { name: "陸平中", code: "中", subjects: ["體育"] },
  { name: "吳燕萍", code: "萍", subjects: ["數學", "物理"] },
  { name: "謝頴雯", code: "雯", subjects: ["中國語文", "視覺藝術"] },
  { name: "吳華峰", code: "峰", subjects: ["體育"] },
  { name: "莫菁兒", code: "莫", subjects: ["中國語文"] },
  { name: "李麗娟", code: "娟", subjects: ["電腦", "資訊及通訊科技"] },
  { name: "何靜妍", code: "妍", subjects: ["公民與社會發展", "歷史"] },
  { name: "張敬才", code: "才", subjects: ["中國語文"] },
  { name: "呂詩恩", code: "呂", subjects: ["中國歷史"] },
  { name: "梁國龍", code: "龍", subjects: ["企會財", "公民與社會發展"] },
  { name: "伍卓鍵", code: "鍵", subjects: ["科學"] },
  { name: "張永泰", code: "永", subjects: ["數學"] },
  { name: "郭鳳萍", code: "郭", subjects: ["英國語文"] },
  { name: "王麗愉", code: "愉", subjects: ["體育"] },
  { name: "陳麗嫻", code: "麗", subjects: ["中國語文"] },
];

const CLASS_TEACHERS: Record<string, string[]> = {
  "1A": ["鳳", "銘"],
  "1B": ["慧", "NIC"],
  "1C": ["KAUR", "丘"],
  "1D": ["DARI", "鵠"],
  "1E": ["SCOT", "思"],
  "2A": ["彤"],
  "2B": ["筠"],
  "2C": ["詠"],
  "2D": ["娜", "WAY"],
  "2E": ["振", "ROIS"],
  "3A": ["珮"],
  "3B": ["俊"],
  "3C": ["浠"],
  "3D": ["徐"],
  "3E": ["范", "JOH"],
  "4A": ["强"],
  "4B": ["言"],
  "4C": ["華"],
  "4D": ["韓"],
  "4E": ["文", "WANG"],
  "5A": ["曹"],
  "5B": ["毅"],
  "5C": ["慈"],
  "5D": ["霞"],
  "5E": ["芳", "守"],
  "6A": ["異"],
  "6B": ["秋"],
  "6C": ["廖", "璋"],
  "6D": ["日"],
  "6E": ["宏", "MIRZ"],
};

const SENIOR_ELECTIVES: Record<string, [string, string, string]> = {
  "4A": ["物理", "化學", "生物"],
  "4B": ["物理", "資訊及通訊科技", "數學延伸M1"],
  "4C": ["歷史", "中國歷史", "地理"],
  "4D": ["經濟", "企會財", "視覺藝術"],
  "4E": ["經濟", "企會財", "應用學習"],
  "5A": ["歷史", "中國歷史", "企會財"],
  "5B": ["物理", "化學", "生物"],
  "5C": ["地理", "資訊及通訊科技", "應用學習"],
  "5D": ["經濟", "企會財", "數學延伸M1"],
  "5E": ["物理", "化學", "生物"],
  "6A": ["歷史", "中國歷史", "地理"],
  "6B": ["經濟", "企會財", "應用學習"],
  "6C": ["物理", "化學", "生物"],
  "6D": ["地理", "資訊及通訊科技", "數學延伸M1"],
  "6E": ["經濟", "化學", "生物"],
};

const SPECIAL_ROOMS: { id: string; name: string }[] = [
  { id: "gym", name: "體育館" },
  { id: "hall", name: "禮堂" },
  { id: "music", name: "音樂室" },
  { id: "va", name: "視藝室" },
  { id: "drama", name: "戲劇室" },
  { id: "ict1", name: "電腦室一" },
  { id: "ict2", name: "電腦室二" },
  { id: "sci", name: "綜合科學室" },
  { id: "phy", name: "物理實驗室" },
  { id: "chem", name: "化學實驗室" },
  { id: "bio", name: "生物實驗室" },
  { id: "lib", name: "圖書館" },
];

const SUBJECT_ROOM: Record<string, string[]> = {
  體育: ["gym"],
  音樂: ["music"],
  視覺藝術: ["va"],
  戲劇: ["drama"],
  電腦: ["ict1", "ict2"],
  資訊及通訊科技: ["ict1", "ict2"],
  科學: ["sci"],
  物理: ["phy"],
  化學: ["chem"],
  生物: ["bio"],
  深度閱讀: ["lib"],
  LCL: ["lib", "hall"],
};

function juniorLoad(): [string, number][] {
  return [
    ["中國語文", 6],
    ["英國語文", 7],
    ["數學", 6],
    ["歷史", 2],
    ["中國歷史", 2],
    ["地理", 2],
    ["公民經濟與社會", 2],
    ["科學", 4],
    ["電腦", 2],
    ["視覺藝術", 2],
    ["音樂", 2],
    ["體育", 2],
    ["LCL", 4],
    ["普通話／戲劇", 1],
  ];
}

function seniorLoad(cls: string): [string, number][] {
  const [e1, e2, e3] = SENIOR_ELECTIVES[cls];
  return [
    ["中國語文", 6],
    ["英國語文", 7],
    ["數學", 6],
    ["公民與社會發展", 3],
    [e1, 5],
    [e2, 5],
    [e3, 5],
    ["體育", 2],
    ["LCL", 4],
    ["深度閱讀／英文會話", 1],
  ];
}

function slots(): { day: DayId; periodId: string }[] {
  const days: DayId[] = ["mon", "tue", "wed", "thu", "fri"];
  const out: { day: DayId; periodId: string }[] = [];
  for (const day of days) {
    for (let i = 1; i <= 8; i++) out.push({ day, periodId: `p${i}` });
    if (day !== "fri") out.push({ day, periodId: "p9" });
  }
  return out;
}

function expandLoad(pairs: [string, number][]): string[] {
  const list: string[] = [];
  for (const [subject, n] of pairs) {
    for (let i = 0; i < n; i++) list.push(subject);
  }
  return list;
}

export function generateSeed(): ScheduleData {
  const teachers: Teacher[] = RAW_TEACHERS.map((t) => ({
    id: t.code,
    name: t.name,
    code: t.code,
    subjects: t.subjects,
    englishName: t.englishName,
  }));
  const byCode = new Map(teachers.map((t) => [t.code, t]));

  const classes: SchoolClass[] = [];
  const rooms: Room[] = SPECIAL_ROOMS.map((r) => ({ ...r, kind: "special" as const }));
  const forms = [1, 2, 3, 4, 5, 6];
  const letters = ["A", "B", "C", "D", "E"];
  for (const form of forms) {
    letters.forEach((letter, idx) => {
      const name = `${form}${letter}`;
      const homeRoom = `${form}0${idx + 1}`;
      rooms.push({ id: homeRoom, name: `${homeRoom}室`, kind: "classroom" });
      classes.push({
        id: name,
        name,
        form,
        stream: form >= 4 ? SENIOR_ELECTIVES[name].join("／") : undefined,
        homeRoom,
        classTeacherIds: CLASS_TEACHERS[name] ?? [],
      });
    });
  }

  const subjectPool = new Map<string, string[]>();
  for (const t of teachers) {
    for (const s of t.subjects) {
      const list = subjectPool.get(s) ?? [];
      list.push(t.code);
      subjectPool.set(s, list);
    }
  }

  const teacherBusy = new Set<string>();
  const classBusy = new Set<string>();
  const roomBusy = new Set<string>();
  const lessons: Lesson[] = [];
  let lessonSeq = 0;

  function busyKey(id: string, day: DayId, periodId: string) {
    return `${id}|${day}|${periodId}`;
  }

  function pickTeacher(subject: string, day: DayId, periodId: string, prefer?: string[]): string | undefined {
    const pool = [
      ...(prefer ?? []).filter((c) => (byCode.get(c)?.subjects ?? []).includes(subject) || subject.includes("／")),
      ...(subjectPool.get(subject) ?? []),
    ];
    if (subject === "普通話／戲劇") {
      const pth = subjectPool.get("普通話") ?? [];
      const drama = subjectPool.get("戲劇") ?? [];
      const a = pth.find((id) => !teacherBusy.has(busyKey(id, day, periodId)));
      const b = drama.find((id) => !teacherBusy.has(busyKey(id, day, periodId)));
      return a && b ? `${a}+${b}` : undefined;
    }
    if (subject === "深度閱讀／英文會話") {
      const read = (subjectPool.get("LCL") ?? []).concat(subjectPool.get("中國語文") ?? []);
      const speak = subjectPool.get("英國語文") ?? [];
      const a = read.find((id) => !teacherBusy.has(busyKey(id, day, periodId)));
      const b = speak.find((id) => !teacherBusy.has(busyKey(id, day, periodId)));
      return a && b ? `${a}+${b}` : undefined;
    }
    const seen = new Set<string>();
    for (const id of pool) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (!teacherBusy.has(busyKey(id, day, periodId))) return id;
    }
    return undefined;
  }

  function pickRoom(subject: string, cls: SchoolClass, day: DayId, periodId: string): string | undefined {
    const specials = SUBJECT_ROOM[subject];
    if (specials) {
      for (const rid of specials) {
        if (!roomBusy.has(busyKey(rid, day, periodId))) return rid;
      }
    }
    if (!roomBusy.has(busyKey(cls.homeRoom, day, periodId))) return cls.homeRoom;
    const fallback = rooms.find(
      (r) => r.kind === "classroom" && !roomBusy.has(busyKey(r.id, day, periodId)),
    );
    return fallback?.id;
  }

  function place(
    cls: SchoolClass,
    subject: string,
    day: DayId,
    periodId: string,
  ): boolean {
    const ck = busyKey(cls.id, day, periodId);
    if (classBusy.has(ck)) return false;

    const teacherPick = pickTeacher(subject, day, periodId, cls.classTeacherIds);
    if (!teacherPick) return false;

    const teacherIds = teacherPick.split("+");
    const displaySubject =
      subject === "普通話／戲劇"
        ? "普通話／戲劇"
        : subject === "深度閱讀／英文會話"
          ? "深度閱讀／英文會話"
          : subject;

    const roomSubject = subject.includes("戲劇")
      ? "戲劇"
      : subject.includes("深度閱讀")
        ? "深度閱讀"
        : subject;
    const roomId = pickRoom(roomSubject, cls, day, periodId);
    if (!roomId) return false;

    for (const tid of teacherIds) teacherBusy.add(busyKey(tid, day, periodId));
    classBusy.add(ck);
    roomBusy.add(busyKey(roomId, day, periodId));

    lessonSeq += 1;
    lessons.push({
      id: `L${lessonSeq}`,
      day,
      periodId,
      classIds: [cls.id],
      teacherIds,
      subject: displaySubject,
      roomId,
      note: subject.includes("／") ? "分組對拆" : undefined,
    });
    return true;
  }

  const allSlots = slots();

  for (const cls of classes) {
    const load = cls.form <= 3 ? juniorLoad() : seniorLoad(cls.id);
    const remaining = expandLoad(load);
    // Prefer LCL on p9 Mon-Thu
    for (const day of ["mon", "tue", "wed", "thu"] as DayId[]) {
      const idx = remaining.indexOf("LCL");
      if (idx >= 0 && place(cls, "LCL", day, "p9")) {
        remaining.splice(idx, 1);
      }
    }

    const orderedSlots = allSlots.filter((s) => s.periodId !== "p9" || cls.form <= 3);
    for (const slot of orderedSlots) {
      if (remaining.length === 0) break;
      if (classBusy.has(busyKey(cls.id, slot.day, slot.periodId))) continue;
      let placed = false;
      for (let i = 0; i < remaining.length; i++) {
        if (place(cls, remaining[i], slot.day, slot.periodId)) {
          remaining.splice(i, 1);
          placed = true;
          break;
        }
      }
      if (!placed) {
        // leave empty — realistic free slot
      }
    }
  }

  return {
    meta: {
      school: SCHOOL_NAME,
      schoolEn: SCHOOL_NAME_EN,
      year: SCHOOL_YEAR,
      updatedAt: new Date().toISOString(),
      source: "seed-from-handbook",
    },
    teachers,
    classes,
    rooms,
    lessons,
  };
}
