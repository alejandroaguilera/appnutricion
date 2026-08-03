import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { localDayString } from "@/lib/date";

// Lectura agregada para la pantalla Hoy (§3.1): plan activo (targets/slots) +
// DayLog + MealEntry + portions del día pedido. Una sola petición para que
// el primer render no dependa de tres round-trips en cascada.
export async function GET(req: NextRequest) {
  const fecha = req.nextUrl.searchParams.get("fecha") ?? localDayString();
  const fechaDate = new Date(`${fecha}T00:00:00.000Z`);

  const [plan, dayLog] = await Promise.all([
    prisma.nutritionPlan.findFirst({
      where: { activo: true },
      include: {
        targets: { include: { foodGroup: { select: { clave: true, nombre: true } } } },
        slots: {
          orderBy: { orden: "asc" },
          include: { targets: { include: { foodGroup: { select: { clave: true, nombre: true } } } } },
        },
      },
    }),
    prisma.dayLog.findUnique({
      where: { fecha: fechaDate },
      include: {
        meals: {
          where: { archivadoEn: null },
          orderBy: { horaRegistro: "asc" },
          include: {
            dish: { select: { id: true, nombre: true } },
            portions: { include: { foodGroup: { select: { clave: true, nombre: true } } } },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({ fecha, plan, dayLog });
}
