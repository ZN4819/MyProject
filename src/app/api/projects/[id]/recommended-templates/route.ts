import { NextResponse } from "next/server";
import { recommendTaskTreeTemplatesForProject } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return NextResponse.json(recommendTaskTreeTemplatesForProject(id));
}
