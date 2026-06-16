import { NextResponse } from "next/server";
import { createDatabaseBackup } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST() {
  try {
    return NextResponse.json(createDatabaseBackup(), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "备份失败" },
      { status: 400 },
    );
  }
}
