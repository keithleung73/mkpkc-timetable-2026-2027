import * as XLSX from "xlsx";
import type { DateRange, TeacherRecordRow } from "./teacher-records";
import { teacherRecordSheetRows, teacherRecordsFilename } from "./teacher-records";

export function teacherRecordsWorkbook(rows: TeacherRecordRow[], title: string): XLSX.WorkBook {
  const aoa = teacherRecordSheetRows(rows);
  if (title) {
    aoa.unshift([title], []);
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
    { wch: 8 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 16 },
    { wch: 10 },
    { wch: 16 },
    { wch: 40 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "代調記錄");
  return wb;
}

export function downloadTeacherRecordsXlsx(
  rows: TeacherRecordRow[],
  teacherName: string | null,
  range: DateRange,
  title: string,
) {
  const wb = teacherRecordsWorkbook(rows, title);
  const filename = teacherRecordsFilename(teacherName, range, "xlsx");
  XLSX.writeFile(wb, filename);
}

export function teacherRecordsCsv(rows: TeacherRecordRow[]): string {
  const aoa = teacherRecordSheetRows(rows);
  return aoa
    .map((line) =>
      line
        .map((cell) => {
          const s = String(cell ?? "");
          if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(","),
    )
    .join("\n");
}

export function downloadTeacherRecordsCsv(
  rows: TeacherRecordRow[],
  teacherName: string | null,
  range: DateRange,
) {
  const csv = `\uFEFF${teacherRecordsCsv(rows)}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = teacherRecordsFilename(teacherName, range, "csv");
  a.click();
  URL.revokeObjectURL(url);
}
