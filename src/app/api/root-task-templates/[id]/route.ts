import { NextResponse } from "next/server";
import { deleteRootTaskTemplate, updateRootTaskTemplate } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json()) as Parameters<typeof updateRootTaskTemplate>[1];
  const template = updateRootTaskTemplate(id, body);

  if (!template) {
    return NextResponse.json({ error: "根任务模板不存在或内容不完整" }, { status: 404 });
  }

  return NextResponse.json(template);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const deleted = deleteRootTaskTemplate(id);

  if (!deleted) {
    return NextResponse.json({ error: "根任务模板不存在" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
