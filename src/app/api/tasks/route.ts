import { NextResponse } from "next/server";
import { createRootTaskFromBestTemplate, createTask, getTasks } from "@/lib/store";
import type { Task } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getTasks());
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: string;
    description?: string;
    sourceType?: Task["sourceType"];
    priority?: Task["priority"];
    projectId?: string | null;
    parentId?: string | null;
    dueDate?: string | null;
    tags?: string[];
    autoTemplate?: boolean;
    rootTaskTemplateId?: string | null;
  };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "任务标题不能为空" }, { status: 400 });
  }

  const task = body.autoTemplate && body.projectId && !body.parentId
    ? createRootTaskFromBestTemplate({
        title: body.title,
        description: body.description,
        projectId: body.projectId,
        priority: body.priority,
        tags: body.tags,
        rootTaskTemplateId: body.rootTaskTemplateId,
      })
    : createTask({
      title: body.title,
      description: body.description,
      sourceType: body.sourceType,
      priority: body.priority,
      projectId: body.projectId,
      parentId: body.parentId,
      dueDate: body.dueDate,
      tags: body.tags,
    });

  return NextResponse.json(task, { status: 201 });
}
