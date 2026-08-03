import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Hidrata IndexedDB al abrir la app (§4). Orden por vecesUsado desc — el
// camino A (§3.2) muestra primero los platillos más frecuentes del slot.
export async function GET() {
  const dishes = await prisma.dish.findMany({
    where: { archivadoEn: null },
    orderBy: { vecesUsado: "desc" },
    include: {
      components: {
        include: {
          foodGroup: { select: { clave: true } },
          foodItem: { select: { nombre: true, cantidadPorcion: true } },
        },
      },
    },
  });

  return NextResponse.json({ dishes });
}
