import { NextResponse } from "next/server";
import { readSchedule, resetSchedule } from "@/lib/store";

export async function GET() {
  const data = readSchedule();
  return NextResponse.json(data);
}

export async function POST() {
  const data = resetSchedule();
  return NextResponse.json(data);
}
