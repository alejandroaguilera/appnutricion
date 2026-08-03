import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Hidrata IndexedDB al abrir la app (§4). Un solo NutritionPlan activo a la vez.
export async function GET() {
  const plan = await prisma.nutritionPlan.findFirst({
    where: { activo: true },
    include: {
      targets: { include: { foodGroup: { select: { clave: true, nombre: true } } } },
      slots: {
        orderBy: { orden: "asc" },
        include: { targets: { include: { foodGroup: { select: { clave: true, nombre: true } } } } },
      },
    },
  });

  if (!plan) return NextResponse.json({ plan: null });

  return NextResponse.json({ plan });
}
