import { NextResponse } from "next/server";
import { createRecurrence, getDashboardData } from "@/lib/store";
import type { RecurrenceRule } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getDashboardData().recurringRules);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    taskId?: string;
    taskTitle?: string;
    frequency?: RecurrenceRule["frequency"];
    interval?: number;
    startAt?: string;
    nextRunAt?: string;
    endsAt?: string | null;
  };

  if ((!body.taskId && !body.taskTitle?.trim()) || !body.frequency) {
    return NextResponse.json({ error: "缺少周期任务参数" }, { status: 400 });
  }

  return NextResponse.json(
    createRecurrence({
      taskId: body.taskId,
      taskTitle: body.taskTitle,
      frequency: body.frequency,
      interval: body.interval,
      startAt: body.startAt,
      nextRunAt: body.nextRunAt,
      endsAt: body.endsAt,
    }),
    { status: 201 },
  );
}
