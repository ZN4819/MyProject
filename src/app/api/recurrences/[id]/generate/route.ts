import { NextResponse } from "next/server";
import { generateRecurringTask } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const task = generateRecurringTask(id);

  if (!task) {
    return NextResponse.json({ error: "周期规则不存在或已暂停" }, { status: 404 });
  }

  return NextResponse.json(task, { status: 201 });
}
