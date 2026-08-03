import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Hidrata IndexedDB al abrir la app (§4). Excluye archivados — pescado y
// salmón están sembrados (§10.2) pero no deben aparecer en la interfaz.
export async function GET() {
  const [foodGroups, items] = await Promise.all([
    prisma.foodGroup.findMany({ orderBy: { orden: "asc" } }),
    prisma.foodItem.findMany({
      where: { archivadoEn: null },
      orderBy: { nombre: "asc" },
    }),
  ]);

  return NextResponse.json({ foodGroups, items });
}
