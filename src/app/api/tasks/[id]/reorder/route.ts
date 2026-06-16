import { NextResponse } from "next/server";
import { reorderTask } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json()) as { direction?: "up" | "down" };

  if (body.direction !== "up" && body.direction !== "down") {
    return NextResponse.json({ error: "排序方向无效" }, { status: 400 });
  }

  return NextResponse.json(reorderTask(id, body.direction));
}
