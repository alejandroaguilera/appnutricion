import { NextRequest, NextResponse } from "next/server";
import { upsertMealEntry } from "@/lib/services/mealEntry";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mealId: string }> }
) {
  const { id, mealId } = await params;
  const body = await req.json();
  const mealEntry = await upsertMealEntry({ ...body, id: mealId, dayLogId: id });
  return NextResponse.json({ mealEntry });
}
