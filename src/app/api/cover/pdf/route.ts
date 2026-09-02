import { NextResponse } from "next/server";
import { coverPdfFilename } from "@/lib/cover-pdf";
import { renderCoverPdf } from "@/lib/cover-pdf-server";
import type { CoverPlan } from "@/lib/cover";
import { readSchedule } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { plan?: CoverPlan; reason?: string };
  try {
    body = (await req.json()) as { plan?: CoverPlan; reason?: string };
  } catch {
    return NextResponse.json({ error: "請求格式不正確" }, { status: 400 });
  }
  if (!body.plan) {
    return NextResponse.json({ error: "未有代堂方案可匯出" }, { status: 400 });
  }
  try {
    const data = readSchedule();
    const buf = await renderCoverPdf(body.plan, data, { reason: body.reason });
    const filename = coverPdfFilename(body.plan.date);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "產生 PDF 失敗" },
      { status: 500 },
    );
  }
}
