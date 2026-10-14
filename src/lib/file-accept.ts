/** 只用副檔名：夾 MIME 有時會令 Windows 檔案窗隔走 .xlsx */
export const EXCEL_ACCEPT = ".xlsx,.xls,.xlsm";
export const RECORDS_UPLOAD_ACCEPT = ".xlsx,.xls,.xlsm,.json";

export function fileMatchesAccept(file: { name: string; type?: string }, accept?: string): boolean {
  if (!accept) return true;
  const tokens = accept
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = (file.type ?? "").toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith(".")) return name.endsWith(token);
    if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}
