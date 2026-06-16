import { NextResponse } from "next/server";
import { updateRecurrence } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json()) as Parameters<typeof updateRecurrence>[1];
  const rule = updateRecurrence(id, body);

  if (!rule) {
    return NextResponse.json({ error: "周期规则不存在" }, { status: 404 });
  }

  return NextResponse.json(rule);
}
