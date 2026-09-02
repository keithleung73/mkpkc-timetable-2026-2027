import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const FILE = "mkpkc-timetable-local.zip";
const DOWNLOAD_NAME = "萬鈞伯裘書院課表-2026-2027.zip";

export async function GET() {
  const filePath = path.join(process.cwd(), "public", FILE);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "本機包尚未準備好" }, { status: 404 });
  }
  const buf = fs.readFileSync(filePath);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(buf.length),
      "Content-Disposition": `attachment; filename="mkpkc-timetable-2026-2027.zip"; filename*=UTF-8''${encodeURIComponent(DOWNLOAD_NAME)}`,
      "Cache-Control": "no-store",
    },
  });
}
