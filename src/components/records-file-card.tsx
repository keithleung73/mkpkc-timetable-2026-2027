"use client";

import { useState } from "react";
import { toast } from "sonner";
import { HardDriveDownload, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoverBalances, SavedCoverPlan } from "@/lib/cover";
import {
  buildRecordsFile,
  downloadRecordsFile,
  parseRecordsFile,
  recordsFileSummary,
  type ParsedRecordsFile,
} from "@/lib/records-file";
import type { ConfirmedSwap } from "@/lib/swap-records";
import type { ScheduleData } from "@/lib/types";
import { coverRequest } from "@/lib/web-ops";

type StorePayload = {
  balances: CoverBalances;
  plans: SavedCoverPlan[];
  swaps?: ConfirmedSwap[];
};

export function RecordsFileCard({
  data,
  balances,
  plans,
  swaps,
  onImported,
}: {
  data: ScheduleData | null;
  balances: CoverBalances;
  plans: SavedCoverPlan[];
  swaps: ConfirmedSwap[];
  onImported?: (payload: StorePayload) => void;
}) {
  const [preview, setPreview] = useState<ParsedRecordsFile | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const downloadAll = () => {
    if (plans.length === 0 && swaps.length === 0) {
      toast.error("而家未有代調堂紀錄可下載");
      return;
    }
    downloadRecordsFile(buildRecordsFile(balances, plans, swaps));
    toast.success("已下載代調堂紀錄檔，可喺第二部電腦上存");
  };

  const readFile = async (next: File | null) => {
    setPreview(null);
    setFileName(next?.name ?? null);
    if (!next) return;
    setBusy(true);
    try {
      const text = await next.text();
      const parsed = parseRecordsFile(text);
      if ("error" in parsed) {
        toast.error(parsed.error);
        return;
      }
      setPreview(parsed);
      const s = recordsFileSummary(parsed);
      toast.message(`已讀代堂 ${s.coverDays} 日、調堂 ${s.swaps} 項，請揀覆蓋或合併`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "讀檔失敗");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (mode: "replace" | "merge") => {
    if (!preview) return;
    setBusy(true);
    try {
      const json = (await coverRequest(data, {
        action: "importRecords",
        mode,
        balances: preview.balances,
        plans: preview.plans,
        swaps: preview.swaps,
      })) as StorePayload;
      onImported?.(json);
      const s = recordsFileSummary(preview);
      toast.success(
        mode === "replace"
          ? `已覆蓋入帳：代堂 ${s.coverDays} 日、調堂 ${s.swaps} 項`
          : `已合併入帳：代堂 ${s.coverDays} 日、調堂 ${s.swaps} 項`,
      );
      setPreview(null);
      setFileName(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上存失敗");
    } finally {
      setBusy(false);
    }
  };

  const summary = preview ? recordsFileSummary(preview) : null;

  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="size-4" />
          上存代調堂紀錄
        </CardTitle>
        <CardDescription>
          下載完整代堂／調堂紀錄檔（連結餘），再喺另一部電腦或瀏覽器上載入帳。覆蓋會取代而家嘅紀錄；合併只覆蓋檔案入面嗰幾日。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={downloadAll} disabled={plans.length + swaps.length === 0}>
            <HardDriveDownload />
            下載紀錄檔
          </Button>
          <label className="inline-flex cursor-pointer items-center">
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                void readFile(file);
              }}
            />
            <span className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium hover:bg-muted">
              <Upload className="size-4" />
              上載紀錄檔
            </span>
          </label>
        </div>
        {fileName ? <p className="text-sm text-muted-foreground">{fileName}</p> : null}
        {summary ? (
          <div className="space-y-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <p>
              代堂 {summary.coverDays} 日（{summary.coverAssignments} 堂）、調堂 {summary.swaps} 項
              {summary.balanceTeachers ? `、結餘 ${summary.balanceTeachers} 人` : ""}
              {summary.exportedAt ? ` · 匯出 ${summary.exportedAt.slice(0, 10)}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void confirm("replace")}>
                {busy ? "入帳中…" : "覆蓋入帳"}
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void confirm("merge")}>
                合併入帳
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
