"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { officialImportPreviewLines, type ArrangementImport } from "@/lib/arrangement-import";
import type { CoverBalances, SavedCoverPlan } from "@/lib/cover";
import type { SavedSwapRecord } from "@/lib/swap-records";

export type RecordsPayload = {
  balances: CoverBalances;
  plans: SavedCoverPlan[];
  swaps: SavedSwapRecord[];
};

export function ArrangementImportCard({ onSaved }: { onSaved?: (payload: RecordsPayload) => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ArrangementImport | null>(null);
  const [busy, setBusy] = useState(false);

  const readFile = async (file: File | null) => {
    setFileName(file?.name ?? null);
    setPreview(null);
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/records", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "讀檔失敗");
      setPreview(json.preview as ArrangementImport);
      toast.message("已讀取通知表，請核對後上存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "讀檔失敗");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", plans: preview.plans, swaps: preview.swaps }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "上存失敗");
      onSaved?.({
        balances: json.balances,
        plans: json.plans,
        swaps: json.swaps,
      });
      toast.success(
        `已上存：代堂 ${preview.summary.coverCount}、合班 ${preview.summary.combineCount}、調堂 ${preview.summary.swapCount}`,
      );
      setPreview(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上存失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="size-4" />
          上存代堂／調堂紀錄
        </CardTitle>
        <CardDescription>
          上載學務部《通知各部門調堂代堂安排》Excel（每個上課日一張工作表）。代堂、合班寫入代堂紀錄，調堂寫入調堂紀錄。確認後會覆蓋該幾日已入帳的紀錄。公假同合班不計結餘。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground hover:bg-muted/40">
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => void readFile(e.target.files?.[0] ?? null)}
          />
          {fileName ? <span className="text-foreground">{fileName}</span> : <span>點擊選擇通知各部門調堂代堂安排 .xlsx</span>}
        </label>
        {preview ? (
          <div className="space-y-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              {officialImportPreviewLines(preview).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {preview.warnings.length > 0 ? (
              <div className="text-amber-900">
                <p className="font-medium">注意（最多 8 項）</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {preview.warnings.slice(0, 8).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Button type="button" disabled={busy} onClick={() => void confirm()}>
              {busy ? "上存中…" : "確認上存（覆蓋該幾日舊紀錄）"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
