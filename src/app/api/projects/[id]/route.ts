import { NextResponse } from "next/server";
import {
  deleteProject,
  ProjectSetNotFoundError,
  updateProject,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json()) as Parameters<typeof updateProject>[1];

  try {
    const project = updateProject(id, body);
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    return NextResponse.json(project);
  } catch (error) {
    if (error instanceof ProjectSetNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const deleted = deleteProject(id);

  if (!deleted) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
