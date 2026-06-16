import { NextResponse } from "next/server";
import { createProjectSet, getDashboardData } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getDashboardData().projectSets);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "项目集名称不能为空" }, { status: 400 });
  }

  return NextResponse.json(createProjectSet({ name: body.name }), { status: 201 });
}
