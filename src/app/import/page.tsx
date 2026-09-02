"use client";

import { useState } from "react";
import { PageBody, PageHeader, ScheduleGate } from "@/components/page-chrome";
import { StaticModeBanner } from "@/components/static-mode-banner";
import { useSchedule } from "@/components/schedule-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const HINTS = [
  {
    title: "1.0 班級總表",
    body: "每班一張工作表，橫列星期一至五、直列第一至第八節。儲存格可寫「科目 / 簡稱 / 地點」。",
  },
  {
    title: "2.0 老師總表",
    body: "每位老師一張工作表。儲存格可寫「班別 / 科目 / 地點」。簡稱須同《成裘集》老師簡稱表一致。",
  },
  {
    title: "3.0 特別室總表",
    body: "每間特別室一張工作表。儲存格可寫「班別 / 科目 / 老師簡稱」。",
  },
  {
    title: "各班配課總表",
    body: "班別為列、星期+節次為欄，儲存格如「中華」「英真」（科目簡稱+老師簡稱）。",
  },
];

export default function ImportPage() {
  return (
    <PageBody>
      <PageHeader
        title="匯入 Excel"
        description="上載學務發展部 Excel。請用「教師時間表」每人一張工作表嘅檔（例如 2. 教師時間表 31-08-2026），堂次會按正式時間表覆蓋。"
      />
      <ScheduleGate>
        <Inner />
      </ScheduleGate>
    </PageBody>
  );
}

function Inner() {
  const { data, reload } = useSchedule();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const onImport = async () => {
    if (files.length === 0) {
      setError("請先選擇至少一個 .xlsx 檔。");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    try {
      const res = await fetch("/api/import", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "匯入失敗");
      setMessage(
        `已匯入 ${json.report.files.length} 個檔、${json.lessons} 堂。來源：${json.meta.source}`,
      );
      setWarnings(json.report.warnings ?? []);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "匯入失敗");
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/schedule", { method: "POST" });
      setMessage("已還原為手冊種子課表。");
      setWarnings([]);
      await reload();
    } catch {
      setError("還原失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <StaticModeBanner feature="匯入 Excel" />
      <Card>
        <CardHeader>
          <CardTitle>上載檔案</CardTitle>
          <CardDescription>
            可一次過拖入「教師時間表」、配課總表、班級／特別室總表。現時資料來源：{data?.meta.source}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground hover:bg-muted/40">
            <input
              type="file"
              accept=".xlsx,.xls"
              multiple
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length === 0 ? (
              <span>點擊或拖放 Excel（.xlsx）到呢度</span>
            ) : (
              <ul className="text-foreground">
                {files.map((f) => (
                  <li key={f.name}>{f.name}</li>
                ))}
              </ul>
            )}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void onImport()} disabled={busy}>
              {busy ? "處理中…" : "匯入並覆蓋課表"}
            </Button>
            <Button variant="outline" onClick={() => void onReset()} disabled={busy}>
              還原示範課表
            </Button>
          </div>
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {warnings.length > 0 ? (
            <div className="rounded-lg border bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-medium">部分儲存格未能完全辨識（最多顯示 40 項）</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {HINTS.map((h) => (
          <Card key={h.title}>
            <CardHeader>
              <CardTitle className="text-base">{h.title}</CardTitle>
              <CardDescription>{h.body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>下載示範 Excel</CardTitle>
          <CardDescription>
            格式對齊 1.0／2.0／3.0 總表，可用嚟試匯入流程；正式檔上載後會取代示範堂次。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <a href="/api/samples/file?kind=class">
            <Button variant="outline">班級總表</Button>
          </a>
          <a href="/api/samples/file?kind=teacher">
            <Button variant="outline">老師總表</Button>
          </a>
          <a href="/api/samples/file?kind=room">
            <Button variant="outline">特別室總表</Button>
          </a>
          <a href="/api/samples/file?kind=assign">
            <Button variant="outline">配課總表</Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
