import { NextResponse } from "next/server";
import { deleteProjectSet, updateProjectSet } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json()) as { name?: string };

  if (body.name !== undefined && !body.name.trim()) {
    return NextResponse.json({ error: "项目集名称不能为空" }, { status: 400 });
  }

  try {
    const projectSet = updateProjectSet(id, body);
    return projectSet
      ? NextResponse.json(projectSet)
      : NextResponse.json({ error: "项目集不存在" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "项目集更新失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  return deleteProjectSet(id)
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "项目集不存在" }, { status: 404 });
}
