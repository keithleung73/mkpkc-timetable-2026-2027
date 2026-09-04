"use client";

import { isStaticExport } from "@/lib/runtime";

export function StaticModeBanner({
  feature,
  mode = "unavailable",
}: {
  feature: string;
  mode?: "unavailable" | "browser";
}) {
  if (!isStaticExport) return null;
  if (mode === "browser") {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
        網上版可以做「{feature}」。紀錄存在<strong>呢部瀏覽器</strong>
        （唔會自動同步去其他同事電腦）。若要全校共用同一份入帳，請用學務部電腦開「共用啟動」。
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      「{feature}」需要本機伺服器（雙擊
      <code className="mx-1 rounded bg-black/5 px-1">共用啟動.bat</code>
      或 <code className="mx-1 rounded bg-black/5 px-1">本機啟動.bat</code>
      ）。
    </div>
  );
}
