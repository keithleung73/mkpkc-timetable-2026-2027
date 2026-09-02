"use client";

import { useEffect } from "react";
import { PageBody, PageHeader } from "@/components/page-chrome";

export default function DownloadPage() {
  useEffect(() => {
    window.location.href = "/api/bundle";
  }, []);

  return (
    <PageBody>
      <PageHeader
        title="下載本機安裝包"
        description="正在下載「萬鈞伯裘書院課表-2026-2027.zip」。如果沒有開始，請撳下面連結。"
      />
      <p className="text-sm">
        <a className="text-primary underline" href="/api/bundle">
          下載 萬鈞伯裘書院課表-2026-2027.zip
        </a>
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        解壓後雙擊「本機啟動」。電腦需要先安裝 Node.js 20（nodejs.org）。
      </p>
    </PageBody>
  );
}
