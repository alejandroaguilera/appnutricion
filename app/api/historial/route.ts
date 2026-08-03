import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute, jsonError } from "@/lib/http/route";
import { computeAdherencia } from "@/lib/nutrition/adherence";

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface DiaAgregado {
  fecha: string;
  registrado: boolean;
  kcal: number;
  proteinaG: number;
  carbosG: number;
  grasaG: number;
  nEntradas: number;
  adherenciaPct: number | null;
  pesoKg: number | null;
}

// Agregados por día calculados desde las porciones CONGELADAS (§7.1): un log
// es un hecho histórico, no una vista que se recalcula contra las tasas de
// hoy. Una sola consulta por rango, agrupada en JS — a ~5 entradas/día el
// rango de un mes son ~150 filas.
export const GET = withRoute<unknown>("historial.get", async (req: NextRequest) => {
  const desde = req.nextUrl.searchParams.get("desde");
  const hasta = req.nextUrl.searchParams.get("hasta");
  if (!desde || !hasta || !ES_FECHA.test(desde) || !ES_FECHA.test(hasta)) {
    return jsonError(422, "rango_invalido");
  }

  const inicio = new Date(`${desde}T00:00:00.000Z`);
  const fin = new Date(`${hasta}T00:00:00.000Z`);

  const [dias, plan, pesos] = await Promise.all([
    prisma.dayLog.findMany({
      where: { fecha: { gte: inicio, lte: fin }, archivadoEn: null },
      orderBy: { fecha: "asc" },
      include: {
        meals: {
          where: { archivadoEn: null },
          include: { portions: { include: { foodGroup: { select: { clave: true } } } } },
        },
      },
    }),
    prisma.nutritionPlan.findFirst({
      where: { activo: true },
      include: { targets: { include: { foodGroup: { select: { clave: true } } } } },
    }),
    prisma.weightEntry.findMany({
      where: { fecha: { gte: inicio, lte: fin } },
      orderBy: { fecha: "asc" },
    }),
  ]);

  const pesoPorFecha = new Map(pesos.map((p) => [p.fecha.toISOString().slice(0, 10), p.pesoKg]));

  const agregados: DiaAgregado[] = dias.map((dia) => {
    const portions = dia.meals.flatMap((m) => m.portions);
    const fecha = dia.fecha.toISOString().slice(0, 10);
    return {
      fecha,
      registrado: dia.meals.length > 0,
      kcal: portions.reduce((a, p) => a + p.kcal, 0),
      proteinaG: portions.reduce((a, p) => a + p.proteinaG, 0),
      carbosG: portions.reduce((a, p) => a + p.carbosG, 0),
      grasaG: portions.reduce((a, p) => a + p.grasaG, 0),
      nEntradas: dia.meals.length,
      adherenciaPct: plan ? computeAdherencia(plan, portions) : null,
      pesoKg: dia.pesoCorporalKg ?? pesoPorFecha.get(fecha) ?? null,
    };
  });

  return NextResponse.json({
    desde,
    hasta,
    dias: agregados,
    objetivo: plan
      ? { kcal: plan.kcalObjetivo, proteinaG: plan.proteinaG }
      : { kcal: 0, proteinaG: 0 },
  });
});
