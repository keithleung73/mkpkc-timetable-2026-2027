"use client";

import { useEffect } from "react";
import { PageBody, PageHeader } from "@/components/page-chrome";
import { StaticModeBanner } from "@/components/static-mode-banner";
import { isStaticExport } from "@/lib/runtime";

export default function DownloadPage() {
  useEffect(() => {
    if (isStaticExport) return;
    window.location.href = "/api/bundle";
  }, []);

  return (
    <PageBody>
      <PageHeader
        title="下載本機安裝包"
        description="正在下載「萬鈞伯裘書院課表-2026-2027.zip」。如果沒有開始，請撳下面連結。"
      />
      <div className="space-y-4">
        <StaticModeBanner feature="本機安裝包" />
        {isStaticExport ? null : (
          <p className="text-sm">
            <a className="text-primary underline" href="/api/bundle">
              下載 萬鈞伯裘書院課表-2026-2027.zip
            </a>
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          解壓後雙擊「本機啟動」。電腦需要先安裝 Node.js 20（nodejs.org）。
        </p>
      </div>
    </PageBody>
  );
}
