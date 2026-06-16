import { NextResponse } from "next/server";
import { assignTaskToProject } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as { projectId?: string };
  if (!body.projectId) {
    return NextResponse.json({ error: "请选择目标项目" }, { status: 400 });
  }

  try {
    const task = assignTaskToProject(id, body.projectId);
    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }
    return NextResponse.json(task);
  } catch (error) {
    const message = error instanceof Error ? error.message : "归入项目失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
