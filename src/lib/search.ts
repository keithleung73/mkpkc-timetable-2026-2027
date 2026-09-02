const SURNAMES: { ch: string; en: string[] }[] = [
  { ch: "歐陽", en: ["au yeung", "auyeung", "au-yeung", "o yang", "ouyang"] },
  { ch: "鄧", en: ["tang", "deng"] },
  { ch: "陳", en: ["chan", "chen", "tan"] },
  { ch: "黃", en: ["wong", "huang", "wang"] },
  { ch: "林", en: ["lam", "lin", "lum"] },
  { ch: "張", en: ["cheung", "chang", "cheong", "zhang"] },
  { ch: "李", en: ["lee", "li"] },
  { ch: "王", en: ["wong", "wang"] },
  { ch: "吳", en: ["ng", "wu"] },
  { ch: "何", en: ["ho", "he"] },
  { ch: "劉", en: ["lau", "liu"] },
  { ch: "周", en: ["chow", "chau", "zhou"] },
  { ch: "鄭", en: ["cheng", "cheang", "zheng"] },
  { ch: "徐", en: ["tsui", "chui", "xu"] },
  { ch: "馮", en: ["fung", "feng"] },
  { ch: "曹", en: ["cho", "tso", "cao"] },
  { ch: "廖", en: ["liu", "liw"] },
  { ch: "羅", en: ["lo", "law", "luo"] },
  { ch: "朱", en: ["chu", "zhu"] },
  { ch: "范", en: ["fan"] },
  { ch: "丘", en: ["yau", "kau", "qiu"] },
  { ch: "郭", en: ["kwok", "guo"] },
  { ch: "姚", en: ["yiu", "yao"] },
  { ch: "馬", en: ["ma"] },
  { ch: "萬", en: ["man", "wan"] },
  { ch: "蕭", en: ["siu", "xiao"] },
  { ch: "梁", en: ["leung", "liang"] },
  { ch: "陸", en: ["luk", "luk", "lu"] },
  { ch: "呂", en: ["lui", "lui", "lyu", "lu"] },
  { ch: "莫", en: ["mok", "mo"] },
  { ch: "謝", en: ["tse", "xie"] },
  { ch: "伍", en: ["ng", "wu"] },
  { ch: "雷", en: ["lui", "lei"] },
  { ch: "盧", en: ["lo", "lu"] },
  { ch: "韓", en: ["hon", "han"] },
  { ch: "袁", en: ["yuen", "yuan"] },
  { ch: "楊", en: ["yeung", "yang"] },
  { ch: "葉", en: ["yip", "ye"] },
  { ch: "許", en: ["hui", "xu"] },
  { ch: "胡", en: ["wu"] },
  { ch: "高", en: ["ko", "gao"] },
  { ch: "鍾", en: ["chung", "zhong"] },
  { ch: "曾", en: ["tsang", "zeng"] },
  { ch: "譚", en: ["tam", "tan"] },
  { ch: "蔡", en: ["choi", "cai"] },
  { ch: "彭", en: ["pang", "peng"] },
];

export type SearchableTeacher = {
  id: string;
  name: string;
  code: string;
  englishName?: string;
  subjects?: string[];
  romanizations?: string[];
};

export function surnameRomanizations(name: string): { ch: string; en: string[] } | null {
  const cleaned = name.trim();
  for (const row of SURNAMES) {
    if (cleaned.startsWith(row.ch)) return row;
  }
  return null;
}

export function teacherEnglishLabels(t: SearchableTeacher): string[] {
  const out = new Set<string>();
  if (t.englishName) out.add(t.englishName);
  for (const r of t.romanizations ?? []) out.add(r);
  const sur = surnameRomanizations(t.name);
  if (sur) sur.en.forEach((e) => out.add(e.replace(/\b\w/g, (c) => c.toUpperCase())));
  return [...out];
}

function haystack(t: SearchableTeacher): string[] {
  const items = [
    t.name,
    t.code,
    t.englishName ?? "",
    ...(t.subjects ?? []),
    ...(t.romanizations ?? []),
  ];
  const sur = surnameRomanizations(t.name);
  if (sur) {
    items.push(sur.ch, ...sur.en);
  }
  return items.map((x) => x.toLowerCase().replace(/[.\s_-]+/g, " ").trim()).filter(Boolean);
}

/** Higher score is a better match. 0 = no match. */
export function teacherMatchScore(t: SearchableTeacher, query: string): number {
  const q = query.trim().toLowerCase().replace(/[.\s_-]+/g, " ").trim();
  if (!q) return 1;
  const code = t.code.toLowerCase();
  const name = t.name.toLowerCase();
  if (code === q) return 100;
  if (name === q) return 95;

  const sur = surnameRomanizations(t.name);
  if (sur && sur.en.some((e) => e === q || e.replace(/\s/g, "") === q.replace(/\s/g, ""))) {
    return 90;
  }
  if (name.startsWith(q)) return 80;
  if (code.startsWith(q)) return 75;

  const bags = haystack(t);
  if (bags.some((h) => h === q)) return 70;
  if (bags.some((h) => h.startsWith(q))) return 60;
  if (bags.some((h) => h.includes(q))) {
    // 簡稱「華」不應只因「張思華」中間有華而排最前
    if (q.length === 1 && name.includes(q) && code !== q) return 20;
    return 40;
  }
  return 0;
}

export function filterTeachers<T extends SearchableTeacher>(teachers: T[], query: string): T[] {
  const q = query.trim();
  if (!q) return teachers;
  return teachers
    .map((t) => ({ t, score: teacherMatchScore(t, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.t.name.localeCompare(b.t.name, "zh-Hant"))
    .map((x) => x.t);
}
