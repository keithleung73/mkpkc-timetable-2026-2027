"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoverBalances, SavedCoverPlan } from "@/lib/cover";
import {
  officialImportPreviewLines,
  parseOfficialArrangementWorkbook,
  resolveOfficialArrangements,
  type OfficialArrangementImport,
} from "@/lib/official-arrangements";
import type { ConfirmedSwap } from "@/lib/swap-records";
import type { ScheduleData } from "@/lib/types";
import { coverRequest } from "@/lib/web-ops";

type CoverStorePayload = {
  balances: CoverBalances;
  plans: SavedCoverPlan[];
  swaps?: ConfirmedSwap[];
};

export function OfficialArrangementImportCard({
  data,
  onImported,
}: {
  data: ScheduleData | null;
  onImported?: (payload: CoverStorePayload) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<OfficialArrangementImport | null>(null);
  const [busy, setBusy] = useState(false);

  const readFile = async (next: File | null) => {
    setFile(next);
    setPreview(null);
    if (!next || !data) return;
    setBusy(true);
    try {
      const buf = await next.arrayBuffer();
      const parsed = parseOfficialArrangementWorkbook(buf, { source: next.name });
      if (parsed.rows.length === 0 && parsed.emptyDates.length === 0) {
        toast.error("呢個檔唔似學務部《通知各部門調堂代堂安排》");
        return;
      }
      const resolved = resolveOfficialArrangements(data, parsed);
      setPreview(resolved);
      toast.message(`已讀 ${resolved.summary.dates.length} 日安排，請核對後入帳`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "讀檔失敗");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview || !data) return;
    setBusy(true);
    try {
      const json = (await coverRequest(data, {
        action: "importOfficial",
        plans: preview.plans,
        swaps: preview.swaps,
      })) as CoverStorePayload;
      onImported?.(json);
      toast.success(
        `已入帳：代堂 ${preview.summary.coverCount}、合班 ${preview.summary.combineCount}、調堂 ${preview.summary.swapCount}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "匯入失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="size-4" />
          匯入學務部通知表
        </CardTitle>
        <CardDescription>
          上載《26-27_通知各部門調堂代堂安排》Excel（每個上課日一張工作表）。代堂、合班會入代堂紀錄，調堂會入調堂紀錄；之後再產生建議會佔用該節。公假／行政需要不計 ±。
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
          {file ? <span className="text-foreground">{file.name}</span> : <span>點擊選擇通知各部門調堂代堂安排 .xlsx</span>}
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
              {busy ? "入帳中…" : "確認入帳（覆蓋該幾日舊紀錄）"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
