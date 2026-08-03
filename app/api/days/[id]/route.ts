import { NextRequest, NextResponse } from "next/server";
import { upsertDayLog } from "@/lib/services/dayLog";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const dayLog = await upsertDayLog({ ...body, id });
  return NextResponse.json({ dayLog });
}
