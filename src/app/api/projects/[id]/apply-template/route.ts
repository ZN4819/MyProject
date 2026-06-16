import { NextResponse } from "next/server";
import { applyTaskTreeTemplateToProject } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json()) as { templateId?: string };

  if (!body.templateId) {
    return NextResponse.json({ error: "任务树模板 ID 不能为空" }, { status: 400 });
  }

  const result = applyTaskTreeTemplateToProject(id, body.templateId);

  if (!result) {
    return NextResponse.json({ error: "项目或任务树模板不存在" }, { status: 404 });
  }

  return NextResponse.json(result);
}
