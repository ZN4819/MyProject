import { NextResponse } from "next/server";
import { createProject, getProjects } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getProjects());
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    description?: string;
    projectType?: string | null;
    status?: string;
    startDate?: string | null;
    dueDate?: string | null;
    tags?: string[];
    archived?: boolean;
    workflowTemplateId?: string | null;
    projectSetId?: string | null;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "项目名称不能为空" }, { status: 400 });
  }

  try {
    return NextResponse.json(
      createProject({
        name: body.name,
        description: body.description,
        projectType: body.projectType,
        status: body.status,
        startDate: body.startDate,
        dueDate: body.dueDate,
        tags: body.tags,
        archived: body.archived,
        workflowTemplateId: body.workflowTemplateId,
        projectSetId: body.projectSetId,
      }),
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "项目创建失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
