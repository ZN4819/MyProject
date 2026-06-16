import { NextResponse } from "next/server";
import { deletePersonnel, updatePersonnel } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as {
      name?: string;
      certificateNumber?: string;
    };
    const personnel = updatePersonnel(id, body);
    if (!personnel) {
      return NextResponse.json({ error: "人员不存在" }, { status: 404 });
    }
    return NextResponse.json(personnel);
  } catch (error) {
    const message = error instanceof Error ? error.message : "编辑人员失败";
    return NextResponse.json(
      { error: message },
      { status: message === "证书编号已存在" ? 409 : 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const personnel = deletePersonnel(id);
  if (!personnel) {
    return NextResponse.json({ error: "人员不存在" }, { status: 404 });
  }
  return NextResponse.json(personnel);
}
