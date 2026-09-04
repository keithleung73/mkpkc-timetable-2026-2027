/** GitHub Pages 靜態站：無 API，只讀課表 JSON */
export const isStaticExport = process.env.NEXT_PUBLIC_STATIC === "true";

export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const GITHUB_PAGES_SITE = "https://keithleung73.github.io/mkpkc-timetable-2026-2027/";

/** 拼上 basePath（fetch／靜態資產用；Next <Link> 會自動加 basePath） */
export function withBasePath(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!basePath) return p;
  return `${basePath}${p}`;
}

export function scheduleDataUrl() {
  if (isStaticExport) return withBasePath("/data/schedule.json");
  return "/api/schedule";
}
