import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getDashboardData());
}
