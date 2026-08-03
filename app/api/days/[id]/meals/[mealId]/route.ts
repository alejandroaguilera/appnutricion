import { NextRequest, NextResponse } from "next/server";
import { upsertMealEntry, archiveMealEntry, serializeMealEntry } from "@/lib/services/mealEntry";
import { withRoute, jsonError } from "@/lib/http/route";

type Ctx = { params: Promise<{ id: string; mealId: string }> };

export const PUT = withRoute<Ctx>("days.meals.put", async (req: NextRequest, { params }) => {
  const { id, mealId } = await params;
  const body = await req.json();
  const mealEntry = await upsertMealEntry({ ...body, id: mealId, dayLogId: id });
  return NextResponse.json({
    mealEntry: serializeMealEntry(mealEntry),
    dayLogId: mealEntry.dayLogId,
  });
});

export const DELETE = withRoute<Ctx>("days.meals.delete", async (_req: NextRequest, { params }) => {
  const { mealId } = await params;
  const mealEntry = await archiveMealEntry(mealId);
  if (!mealEntry) return jsonError(404, "no_encontrado");
  return NextResponse.json({ mealEntry: serializeMealEntry(mealEntry) });
});
