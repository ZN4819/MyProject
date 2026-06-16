import { NextResponse } from "next/server";
import { createRootTaskTemplate, getRootTaskTemplates } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getRootTaskTemplates());
}

export async function POST(request: Request) {
  const body = (await request.json()) as Parameters<typeof createRootTaskTemplate>[0];

  if (!body.name?.trim() || !body.rootTitle?.trim() || !Array.isArray(body.nodes)) {
    return NextResponse.json({ error: "根任务模板名称、根任务标题和子任务节点不能为空" }, { status: 400 });
  }

  const template = createRootTaskTemplate(body);

  if (!template) {
    return NextResponse.json({ error: "根任务模板创建失败" }, { status: 400 });
  }

  return NextResponse.json(template, { status: 201 });
}
