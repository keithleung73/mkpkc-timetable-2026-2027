import {
  affectedSubjects,
  coverFormHeader,
  coverPdfFilename,
  coverPdfRows,
  involvedTeacherNames,
} from "./cover-pdf";
import type { CoverPlan } from "./cover";
import type { ScheduleData } from "./types";

/** GitHub Pages 無伺服器 PDF：用瀏覽器列印／另存 PDF。 */
export function printCoverPlan(plan: CoverPlan, data: ScheduleData, reason: string) {
  const rows = coverPdfRows(plan, data);
  const subjects = affectedSubjects(plan, data);
  const w = window.open("", "_blank", "width=1024,height=768");
  if (!w) throw new Error("瀏覽器阻擋彈出視窗，請允許後再匯出");
  const tableRows = rows
    .map(
      (r) => `<tr>
        <td>${r.showDate ? r.date : ""}</td>
        <td>${r.showTeacher ? r.teacher : ""}</td>
        <td>${r.action}</td>
        <td>${r.periods}</td>
        <td>${r.classSubjectRoom}</td>
        <td>${r.coverTeacher}</td>
        <td>${r.arrangement}</td>
        <td>${r.remark}</td>
      </tr>`,
    )
    .join("");
  const subjectLine = subjects.map((s) => `${s.subject}（${s.count}）`).join("、");
  w.document.write(`<!doctype html><html lang="zh-Hant"><head>
    <meta charset="utf-8"/>
    <title>${coverPdfFilename(plan.date)}</title>
    <style>
      body { font-family: "Noto Sans TC", "PingFang TC", sans-serif; padding: 24px; color: #111; }
      h1 { font-size: 18px; margin: 0 0 8px; }
      p { font-size: 13px; margin: 4px 0; }
      table { border-collapse: collapse; width: 100%; margin-top: 12px; font-size: 12px; }
      th, td { border: 1px solid #333; padding: 6px 8px; vertical-align: top; }
      th { background: #f3f3f3; }
    </style>
  </head><body>
    <h1>${coverFormHeader()}</h1>
    <p>請假老師：${involvedTeacherNames(plan, data)}　原因：${reason || "請假"}</p>
    <p>受影響科目：${subjectLine || "—"}</p>
    <table>
      <thead>
        <tr>
          <th>日期</th><th>請假老師</th><th>安排</th><th>節次</th>
          <th>班／科／室</th><th>代堂人</th><th>處理</th><th>備註</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
