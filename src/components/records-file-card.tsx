"use client";

import { useState } from "react";
import { toast } from "sonner";
import { HardDriveDownload, Upload } from "lucide-react";
import { FileDropArea, RECORDS_UPLOAD_ACCEPT } from "@/components/file-drop-area";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoverBalances, SavedCoverPlan } from "@/lib/cover";
import {
  officialImportPreviewLines,
  isOfficialArrangementWorkbook,
  parseOfficialArrangementWorkbook,
  resolveOfficialArrangements,
  type OfficialArrangementImport,
} from "@/lib/official-arrangements";
import {
  buildRecordsFile,
  downloadRecordsFile,
  isExcelUploadName,
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

type Preview =
  | { kind: "json"; parsed: ParsedRecordsFile }
  | { kind: "excel"; parsed: OfficialArrangementImport };

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
  const [preview, setPreview] = useState<Preview | null>(null);
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
      if (isExcelUploadName(next.name)) {
        if (!data) {
          toast.error("課表未載入，無法讀通知表");
          return;
        }
        const buf = await next.arrayBuffer();
        const workbook = parseOfficialArrangementWorkbook(buf, { source: next.name });
        if (!isOfficialArrangementWorkbook(workbook)) {
          toast.error(
            "呢個 Excel 唔似學務部《通知各部門調堂代堂安排》。查閱頁「下載 Excel」係報表，唔可以再入帳；請改用「下載紀錄檔」嘅 .json。",
          );
          return;
        }
        const resolved = resolveOfficialArrangements(data, workbook);
        setPreview({ kind: "excel", parsed: resolved });
        toast.message(`已讀通知表 ${resolved.summary.dates.length} 日安排，請核對後入帳`);
        return;
      }
      const text = await next.text();
      const parsed = parseRecordsFile(text);
      if ("error" in parsed) {
        toast.error(`${parsed.error}。亦可上載學務部通知表 .xlsx`);
        return;
      }
      setPreview({ kind: "json", parsed });
      const s = recordsFileSummary(parsed);
      toast.message(`已讀代堂 ${s.coverDays} 日、調堂 ${s.swaps} 項，請揀覆蓋或合併`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "讀檔失敗");
    } finally {
      setBusy(false);
    }
  };

  const confirmJson = async (mode: "replace" | "merge") => {
    if (!preview || preview.kind !== "json") return;
    setBusy(true);
    try {
      const json = (await coverRequest(data, {
        action: "importRecords",
        mode,
        balances: preview.parsed.balances,
        plans: preview.parsed.plans,
        swaps: preview.parsed.swaps,
      })) as StorePayload;
      onImported?.(json);
      const s = recordsFileSummary(preview.parsed);
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

  const confirmExcel = async () => {
    if (!preview || preview.kind !== "excel" || !data) return;
    setBusy(true);
    try {
      const json = (await coverRequest(data, {
        action: "importOfficial",
        plans: preview.parsed.plans,
        swaps: preview.parsed.swaps,
      })) as StorePayload;
      onImported?.(json);
      toast.success(
        `已入帳：代堂 ${preview.parsed.summary.coverCount}、合班 ${preview.parsed.summary.combineCount}、調堂 ${preview.parsed.summary.swapCount}`,
      );
      setPreview(null);
      setFileName(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "匯入失敗");
    } finally {
      setBusy(false);
    }
  };

  const jsonSummary = preview?.kind === "json" ? recordsFileSummary(preview.parsed) : null;

  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="size-4" />
          上存代調堂紀錄
        </CardTitle>
        <CardDescription>
          下載完整代堂／調堂紀錄檔（.json），再喺另一部電腦或瀏覽器上載入帳；亦可直接上載學務部《通知各部門調堂代堂安排》Excel。JSON
          覆蓋會取代而家嘅紀錄，合併只覆蓋檔案入面嗰幾日；通知表則按日期覆蓋該幾日舊紀錄。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button type="button" variant="outline" onClick={downloadAll} disabled={plans.length + swaps.length === 0}>
          <HardDriveDownload />
          下載紀錄檔
        </Button>
        <FileDropArea
          accept={RECORDS_UPLOAD_ACCEPT}
          disabled={busy}
          className="flex min-h-24 flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground hover:bg-muted/40"
          onFiles={(files) => void readFile(files[0] ?? null)}
        >
          {fileName ? (
            <span className="text-foreground">{fileName}</span>
          ) : (
            <span>點擊或拖放通知表 .xlsx，或本系統下載嘅 .json</span>
          )}
        </FileDropArea>
        {jsonSummary ? (
          <div className="space-y-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <p>
              代堂 {jsonSummary.coverDays} 日（{jsonSummary.coverAssignments} 堂）、調堂 {jsonSummary.swaps} 項
              {jsonSummary.balanceTeachers ? `、結餘 ${jsonSummary.balanceTeachers} 人` : ""}
              {jsonSummary.exportedAt ? ` · 匯出 ${jsonSummary.exportedAt.slice(0, 10)}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void confirmJson("replace")}>
                {busy ? "入帳中…" : "覆蓋入帳"}
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void confirmJson("merge")}>
                合併入帳
              </Button>
            </div>
          </div>
        ) : null}
        {preview?.kind === "excel" ? (
          <div className="space-y-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              {officialImportPreviewLines(preview.parsed).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {preview.parsed.warnings.length > 0 ? (
              <div className="text-amber-900">
                <p className="font-medium">注意（最多 8 項）</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {preview.parsed.warnings.slice(0, 8).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Button type="button" disabled={busy} onClick={() => void confirmExcel()}>
              {busy ? "入帳中…" : "確認入帳（覆蓋該幾日舊紀錄）"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
