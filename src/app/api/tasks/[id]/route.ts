import { NextResponse } from "next/server";
import { deleteTask, updateTask } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as Parameters<typeof updateTask>[1] & {
    projectId?: string | null;
  };

  if (Object.prototype.hasOwnProperty.call(body, "projectId")) {
    return NextResponse.json(
      { error: "归属项目不能在任务详情中修改" },
      { status: 400 },
    );
  }

  try {
    const task = updateTask(id, body);
    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }
    return NextResponse.json(task);
  } catch (error) {
    const message = error instanceof Error ? error.message : "任务更新失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = deleteTask(id);
  if (!deleted) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
