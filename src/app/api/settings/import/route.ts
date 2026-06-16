import { NextResponse } from "next/server";
import { importLocalData, type LocalDataExport } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as LocalDataExport;

  if (body.version !== 1) {
    return NextResponse.json({ error: "导入文件版本不兼容" }, { status: 400 });
  }

  return NextResponse.json(importLocalData(body));
}
