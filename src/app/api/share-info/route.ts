import { NextResponse } from "next/server";
import { lanHttpUrls, SHARE_PORT } from "@/lib/share-urls";

export async function GET() {
  const lanUrls = lanHttpUrls(SHARE_PORT);
  return NextResponse.json({
    port: SHARE_PORT,
    lanUrls,
    localUrl: `http://127.0.0.1:${SHARE_PORT}`,
  });
}
