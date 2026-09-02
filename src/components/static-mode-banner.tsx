"use client";

import { isStaticExport } from "@/lib/runtime";

export function StaticModeBanner({ feature }: { feature: string }) {
  if (!isStaticExport) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      GitHub Pages 為<strong>唯讀課表站</strong>，「{feature}」需要本機伺服器（雙擊
      <code className="mx-1 rounded bg-black/5 px-1">共用啟動.bat</code>
      或 <code className="mx-1 rounded bg-black/5 px-1">本機啟動.bat</code>
      ）。網上版可查老師／班別／空閒時段。
    </div>
  );
}
