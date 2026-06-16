import { NextResponse } from "next/server";
import { createWorkflowTemplate, getWorkflows } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getWorkflows());
}

export async function POST(request: Request) {
  const body = (await request.json()) as Parameters<typeof createWorkflowTemplate>[0];

  if (!body.name?.trim() || !Array.isArray(body.states) || body.states.length < 2) {
    return NextResponse.json({ error: "工作流名称和至少两个状态不能为空" }, { status: 400 });
  }

  const workflow = createWorkflowTemplate(body);

  if (!workflow) {
    return NextResponse.json({ error: "工作流模板创建失败" }, { status: 400 });
  }

  return NextResponse.json(workflow, { status: 201 });
}
