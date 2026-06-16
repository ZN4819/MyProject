import { NextResponse } from "next/server";
import { createPersonnel, getPersonnel } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getPersonnel());
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      certificateNumber?: string;
    };
    const personnel = createPersonnel({
      name: body.name ?? "",
      certificateNumber: body.certificateNumber ?? "",
    });
    return NextResponse.json(personnel, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "新增人员失败";
    return NextResponse.json(
      { error: message },
      { status: message === "证书编号已存在" ? 409 : 400 },
    );
  }
}
