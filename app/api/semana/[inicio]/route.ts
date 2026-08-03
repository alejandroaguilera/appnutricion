import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute, jsonError } from "@/lib/http/route";
import { computeAdherencia } from "@/lib/nutrition/adherence";
import { computeWeeklyReview, type DiaSemana } from "@/lib/nutrition/weeklyReview";

type Ctx = { params: Promise<{ inicio: string }> };

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function sumarDias(fecha: Date, n: number): Date {
  const d = new Date(fecha);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

async function cargarDias(desde: Date, hasta: Date): Promise<DiaSemana[]> {
  const [dias, plan, pesos] = await Promise.all([
    prisma.dayLog.findMany({
      where: { fecha: { gte: desde, lt: hasta }, archivadoEn: null },
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
    prisma.weightEntry.findMany({ where: { fecha: { gte: desde, lt: hasta } } }),
  ]);

  const pesoPorFecha = new Map(pesos.map((p) => [p.fecha.toISOString().slice(0, 10), p.pesoKg]));

  return dias.map((dia) => {
    const portions = dia.meals.flatMap((m) => m.portions);
    const fecha = dia.fecha.toISOString().slice(0, 10);
    return {
      fecha,
      registrado: dia.meals.length > 0,
      kcal: portions.reduce((a, p) => a + p.kcal, 0),
      proteinaG: portions.reduce((a, p) => a + p.proteinaG, 0),
      adherenciaPct: plan ? computeAdherencia(plan, portions) : null,
      pesoKg: dia.pesoCorporalKg ?? pesoPorFecha.get(fecha) ?? null,
    };
  });
}

// §3.5 — revisión semanal. La semana previa se carga solo para el delta de
// peso: el ajuste del §7.3 se decide con promedio móvil de 7 días, nunca con
// un dato aislado.
export const GET = withRoute<Ctx>("semana.get", async (_req: NextRequest, { params }) => {
  const { inicio } = await params;
  if (!ES_FECHA.test(inicio)) return jsonError(422, "fecha_invalida");

  const desde = new Date(`${inicio}T00:00:00.000Z`);
  const hasta = sumarDias(desde, 7);
  const previaDesde = sumarDias(desde, -7);

  const [dias, previa, plan] = await Promise.all([
    cargarDias(desde, hasta),
    cargarDias(previaDesde, desde),
    prisma.nutritionPlan.findFirst({ where: { activo: true } }),
  ]);

  const pesosPrevios = previa.map((d) => d.pesoKg).filter((x): x is number => x !== null);
  const pesoPrevioMovil7d = pesosPrevios.length
    ? pesosPrevios.reduce((a, b) => a + b, 0) / pesosPrevios.length
    : null;

  const revision = computeWeeklyReview({
    semanaInicio: inicio,
    dias,
    objetivo: { kcal: plan?.kcalObjetivo ?? 0, proteinaG: plan?.proteinaG ?? 0 },
    pesoPrevioMovil7d,
  });

  return NextResponse.json({ revision, dias });
});
