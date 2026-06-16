import { NextResponse } from "next/server";
import { createTaskTreeTemplate, getTaskTreeTemplates } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getTaskTreeTemplates());
}

export async function POST(request: Request) {
  const body = (await request.json()) as Parameters<typeof createTaskTreeTemplate>[0];

  if (!body.name?.trim() || !Array.isArray(body.nodes) || body.nodes.length === 0) {
    return NextResponse.json({ error: "任务树模板名称和节点不能为空" }, { status: 400 });
  }

  const template = createTaskTreeTemplate(body);

  if (!template) {
    return NextResponse.json({ error: "任务树模板创建失败" }, { status: 400 });
  }

  return NextResponse.json(template, { status: 201 });
}
