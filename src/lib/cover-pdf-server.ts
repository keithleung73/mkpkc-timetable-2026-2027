import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import {
  affectedSubjects,
  chunkAffected,
  coverFormHeader,
  coverPdfRows,
  involvedTeacherNames,
  type CoverPdfRow,
} from "./cover-pdf";
import type { CoverPlan } from "./cover";
import type { ScheduleData } from "./types";

const MARGIN = 36;
const TITLE_SIZE = 16;
const BODY_SIZE = 9;
const SMALL_SIZE = 8;
const FONT_CJK = "cjk";
const FONT_LATIN = "Helvetica";

function fontPath() {
  const candidates = [
    path.join(process.cwd(), "fonts", "DroidSansFallback.ttf"),
    "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error("找不到中文字型，無法產生 PDF");
}

function pdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

/** DroidSansFallback 只有中文，ASCII 數字／英文字要用 Helvetica，否則會變空格方塊。 */
function fontForChar(ch: string): typeof FONT_CJK | typeof FONT_LATIN {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp <= 0x24f) return FONT_LATIN;
  if (cp >= 0x2000 && cp <= 0x206f) return FONT_LATIN;
  return FONT_CJK;
}

function splitRuns(text: string): { font: string; text: string }[] {
  const runs: { font: string; text: string }[] = [];
  for (const ch of text) {
    const font = fontForChar(ch);
    const last = runs[runs.length - 1];
    if (last && last.font === font) last.text += ch;
    else runs.push({ font, text: ch });
  }
  return runs;
}

function measureMixed(doc: PDFKit.PDFDocument, text: string, size: number): number {
  let w = 0;
  for (const run of splitRuns(text)) {
    doc.font(run.font).fontSize(size);
    w += doc.widthOfString(run.text);
  }
  return w;
}

function wrapMixed(doc: PDFKit.PDFDocument, text: string, width: number, size: number): string[] {
  const raw = (text || "").trim();
  if (!raw) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const ch of raw) {
    const next = cur + ch;
    if (cur && measureMixed(doc, next, size) > width) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function drawMixed(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  opts?: { align?: "left" | "center"; color?: string },
) {
  const align = opts?.align ?? "left";
  const color = opts?.color ?? "#111";
  const total = measureMixed(doc, text, size);
  let cx = x;
  if (align === "center") cx = x + Math.max(0, (width - total) / 2);
  for (const run of splitRuns(text)) {
    doc.font(run.font).fontSize(size).fillColor(color);
    doc.text(run.text, cx, y, { lineBreak: false, continued: false });
    cx += doc.widthOfString(run.text);
  }
}

export async function renderCoverPdf(
  plan: CoverPlan,
  data: ScheduleData,
  opts?: { reason?: string },
): Promise<Buffer> {
  const font = fontPath();
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    info: {
      Title: coverFormHeader(),
      Author: "萬鈞伯裘書院學務發展部",
    },
  });
  doc.registerFont(FONT_CJK, font);
  doc.font(FONT_CJK);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const contentW = pageW - MARGIN * 2;
  let y = MARGIN;

  const drawTitle = () => {
    drawMixed(doc, coverFormHeader(), MARGIN, y, contentW, TITLE_SIZE, { align: "center" });
    y += 26;
  };

  const ensure = (need: number) => {
    if (y + need <= pageH - MARGIN) return;
    doc.addPage();
    y = MARGIN;
    drawTitle();
  };

  drawTitle();

  const reason = (opts?.reason ?? "").trim() || "請假";
  const info = [
    ["日期：", formatDateValue(plan)],
    ["調堂事源：", reason],
    ["牽涉老師：", involvedTeacherNames(plan, data) || "—"],
  ];
  for (const [label, value] of info) {
    drawMixed(doc, label, MARGIN, y, 72, BODY_SIZE);
    const lines = wrapMixed(doc, value, contentW - 80, BODY_SIZE);
    for (const line of lines) {
      drawMixed(doc, line, MARGIN + 72, y, contentW - 80, BODY_SIZE);
      y += 14;
    }
  }

  y += 4;
  drawMixed(doc, "*為即日調堂", MARGIN, y, contentW, SMALL_SIZE, { color: "#b45309" });
  y += 16;

  const rows = coverPdfRows(plan, data);
  const cols: { label: string; width: number; get: (r: CoverPdfRow) => string }[] = [
    { label: "日期", width: 0.11, get: (r) => (r.showDate ? r.date : "") },
    { label: "原上課老師", width: 0.1, get: (r) => (r.showTeacher ? r.teacher : "") },
    { label: "課堂處理", width: 0.08, get: (r) => r.action },
    { label: "節數", width: 0.07, get: (r) => r.periods },
    { label: "班別 科目(課室)", width: 0.16, get: (r) => r.classSubjectRoom },
    { label: "代堂/調堂老師", width: 0.12, get: (r) => r.coverTeacher },
    { label: "代堂/調堂安排", width: 0.2, get: (r) => r.arrangement },
    { label: "備註", width: 0.16, get: (r) => r.remark },
  ];
  const widths = cols.map((c) => c.width * contentW);

  const drawMainHeader = () => {
    const h = 22;
    ensure(h + 8);
    let x = MARGIN;
    cols.forEach((c, i) => {
      doc.rect(x, y, widths[i], h).fillAndStroke("#e8eef5", "#333");
      drawMixed(doc, c.label, x + 3, y + 6, widths[i] - 6, SMALL_SIZE, { align: "center" });
      x += widths[i];
    });
    y += h;
  };

  drawMainHeader();

  if (rows.length === 0) {
    const h = 22;
    doc.rect(MARGIN, y, contentW, h).stroke("#333");
    drawMixed(doc, "當日無代堂紀錄", MARGIN, y + 6, contentW, SMALL_SIZE, {
      align: "center",
      color: "#666",
    });
    y += h + 12;
  } else {
    for (const row of rows) {
      const texts = cols.map((c) => c.get(row));
      const lineSets = texts.map((t, i) => wrapMixed(doc, t, widths[i] - 8, SMALL_SIZE));
      const h = Math.max(20, ...lineSets.map((ls) => ls.length * 11 + 8));
      if (y + h > pageH - MARGIN) {
        doc.addPage();
        y = MARGIN;
        drawTitle();
        drawMainHeader();
      }
      let x = MARGIN;
      cols.forEach((_, i) => {
        doc.rect(x, y, widths[i], h).stroke("#333");
        const pad = (h - lineSets[i].length * 11) / 2;
        lineSets[i].forEach((line, li) => {
          drawMixed(doc, line, x + 4, y + Math.max(3, pad) + li * 11, widths[i] - 8, SMALL_SIZE, {
            align: "center",
          });
        });
        x += widths[i];
      });
      y += h;
    }
    y += 14;
  }

  ensure(90);
  drawMixed(doc, "受影響科目：", MARGIN, y, contentW, BODY_SIZE);
  y += 16;

  const affected = chunkAffected(affectedSubjects(plan, data), 3);
  const dateW = contentW * 0.14;
  const groupW = (contentW - dateW) / 3;
  const subW = [groupW * 0.28, groupW * 0.32, groupW * 0.4];

  const drawAffectedHeader = (subjects: string[]) => {
    const h1 = 18;
    const h2 = 18;
    ensure(h1 + h2 + 20);
    doc.rect(MARGIN, y, dateW, h1 + h2).fillAndStroke("#e8eef5", "#333");
    drawMixed(doc, "日期", MARGIN, y + 12, dateW, SMALL_SIZE, { align: "center" });
    let x = MARGIN + dateW;
    for (let g = 0; g < 3; g++) {
      doc.rect(x, y, groupW, h1).fillAndStroke("#e8eef5", "#333");
      drawMixed(doc, subjects[g] ?? "", x, y + 4, groupW, SMALL_SIZE, { align: "center" });
      let sx = x;
      ["堂數", "級別", "課節"].forEach((lab, i) => {
        doc.rect(sx, y + h1, subW[i], h2).fillAndStroke("#e8eef5", "#333");
        drawMixed(doc, lab, sx, y + h1 + 4, subW[i], SMALL_SIZE, { align: "center" });
        sx += subW[i];
      });
      x += groupW;
    }
    y += h1 + h2;
  };

  affected.forEach((group, gi) => {
    drawAffectedHeader(group.map((g) => g.subject));
    const h = 20;
    ensure(h);
    doc.rect(MARGIN, y, dateW, h).stroke("#333");
    drawMixed(doc, gi === 0 ? formatDateValue(plan) : "", MARGIN, y + 5, dateW, SMALL_SIZE, {
      align: "center",
    });
    let x = MARGIN + dateW;
    for (let g = 0; g < 3; g++) {
      const cell = group[g];
      const vals = cell ? [String(cell.count), cell.levels, cell.periods] : ["", "", ""];
      vals.forEach((val, i) => {
        doc.rect(x, y, subW[i], h).stroke("#333");
        drawMixed(doc, val, x + 2, y + 5, subW[i] - 4, SMALL_SIZE, { align: "center" });
        x += subW[i];
      });
    }
    y += h + 8;
  });

  return pdfBuffer(doc);
}

function formatDateValue(plan: CoverPlan) {
  const [y, m, d] = plan.date.split("-");
  const short = { mon: "一", tue: "二", wed: "三", thu: "四", fri: "五" }[plan.day];
  return `${Number(d)}/${Number(m)}/${y}(${short})`;
}
