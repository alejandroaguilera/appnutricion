import { prisma } from "@/lib/prisma";
import { localDayString } from "@/lib/date";
import { sendMessage, telegramConfig } from "@/lib/telegram/api";
import { barrasDelDia } from "@/lib/telegram/registro";
import { logEvent } from "@/lib/log";

// §6.7, reglas de tono, no negociables:
// - Nunca reclamar. Si un día no tuvo registros, el bot NO escribe.
// - Sin culpa, sin rachas rotas, sin ✗ rojos, sin caritas tristes.
// - Un día fuera de objetivo se reporta como dato neutro.
// - Máximo dos mensajes no solicitados al día.

export async function enviarResumenDiario(): Promise<void> {
  const cfg = telegramConfig();
  if (!cfg.habilitado || !cfg.chatId) return;

  const fecha = localDayString();
  const dia = await prisma.dayLog.findUnique({
    where: { fecha: new Date(`${fecha}T00:00:00.000Z`) },
    include: {
      meals: { where: { archivadoEn: null }, include: { portions: true } },
    },
  });

  // "Solo si el día tiene al menos un registro". Un bot que regaña se
  // silencia, y un bot silenciado no sirve.
  if (!dia || dia.meals.length === 0) {
    logEvent("resumen_diario_omitido", { fecha, motivo: "sin_registros" });
    return;
  }

  const plan = await prisma.nutritionPlan.findFirst({ where: { activo: true } });
  const portions = dia.meals.flatMap((m) => m.portions);
  const kcal = portions.reduce((a, p) => a + p.kcal, 0);
  const proteina = portions.reduce((a, p) => a + p.proteinaG, 0);
  const barras = await barrasDelDia(fecha);

  const faltantes = barras
    .filter((b) => !b.esLibre && b.objetivo > 0 && b.actual < b.objetivo)
    .map((b) => `${b.nombre.toLowerCase()} ${(b.objetivo - b.actual).toFixed(1)}`);

  const cierre = faltantes.length > 0 ? `\n\nQuedó pendiente: ${faltantes.join(", ")}.` : "";

  await sendMessage(
    cfg.chatId,
    `<b>Resumen del día</b>\n\n` +
      `${Math.round(kcal)} / ${Math.round(plan?.kcalObjetivo ?? 0)} kcal\n` +
      `Proteína ${Math.round(proteina)} / ${Math.round(plan?.proteinaG ?? 0)} g\n` +
      `${dia.meals.length} ${dia.meals.length === 1 ? "registro" : "registros"}` +
      cierre
  );
}

export async function enviarRevisionSemanal(): Promise<void> {
  const cfg = telegramConfig();
  if (!cfg.habilitado || !cfg.chatId) return;

  const hoy = localDayString();
  const desde = new Date(`${hoy}T00:00:00.000Z`);
  desde.setUTCDate(desde.getUTCDate() - 7);

  const [dias, plan] = await Promise.all([
    prisma.dayLog.findMany({
      where: { fecha: { gte: desde }, archivadoEn: null },
      include: { meals: { where: { archivadoEn: null }, include: { portions: true } } },
    }),
    prisma.nutritionPlan.findFirst({ where: { activo: true } }),
  ]);

  const conRegistro = dias.filter((d) => d.meals.length > 0);
  if (conRegistro.length === 0) {
    logEvent("revision_semanal_omitida", { motivo: "sin_registros" });
    return;
  }

  const kcal = conRegistro.map((d) => d.meals.flatMap((m) => m.portions).reduce((a, p) => a + p.kcal, 0));
  const prot = conRegistro.map((d) =>
    d.meals.flatMap((m) => m.portions).reduce((a, p) => a + p.proteinaG, 0)
  );
  const prom = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  // §7.3: con menos de 4 días registrados NO se sugiere ningún ajuste. Sin
  // datos no hay decisión.
  const sugerencia =
    conRegistro.length < 4
      ? "Con menos de 4 días registrados no hay base para sugerir ajustes."
      : "La app sugiere y explica; el ajuste lo aplicas tú.";

  await sendMessage(
    cfg.chatId,
    `<b>Revisión semanal</b>\n\n` +
      `Días registrados: ${conRegistro.length} / 7\n` +
      `Promedio: ${Math.round(prom(kcal))} kcal · P ${Math.round(prom(prot))} g\n` +
      `Objetivo: ${Math.round(plan?.kcalObjetivo ?? 0)} kcal · P ${Math.round(plan?.proteinaG ?? 0)} g\n\n` +
      sugerencia
  );
}
