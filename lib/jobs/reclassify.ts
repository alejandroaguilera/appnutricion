import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { estimatePortions } from "@/lib/ai/estimatePortions";
import { loadDishContext } from "@/lib/ai/dishContext";
import { AiUnavailableError, aiConfig } from "@/lib/ai/provider";
import { FOOD_GROUPS, computePortionMacros } from "@/lib/nutrition/groups";
import { logEvent, errorInfo } from "@/lib/log";

const MAX_INTENTOS = 5;
const RECLAMO_VENCE_MS = 10 * 60_000;

export interface ReclassifyResult {
  intentadas: number;
  clasificadas: number;
  fallidas: number;
}

// Reclasificación diferida (§3.2-D): si la IA no estaba disponible, la
// entrada se guardó igual con `estadoClasificacion = pendiente` y el texto o
// la foto intactos. Aquí se reintenta.
//
// "Nunca se descarta el registro — un dato sin clasificar vale mucho más que
// ningún dato": tras MAX_INTENTOS queda como `fallido`, que sigue siendo
// visible y editable a mano, no borrado.
export async function reclassifyPending(limite = 5): Promise<ReclassifyResult> {
  const res: ReclassifyResult = { intentadas: 0, clasificadas: 0, fallidas: 0 };
  if (!aiConfig().habilitado) return res;

  const vencido = new Date(Date.now() - RECLAMO_VENCE_MS);

  // Reclamo atómico de un solo uso: dos ticks concurrentes no pueden tomar la
  // misma entrada. El reclamo caduca para que un proceso muerto no la deje
  // atorada para siempre.
  const candidatas = await prisma.mealEntry.findMany({
    where: {
      estadoClasificacion: "pendiente",
      archivadoEn: null,
      reclasificacionIntentos: { lt: MAX_INTENTOS },
      OR: [{ reclasificacionReclamadaEn: null }, { reclasificacionReclamadaEn: { lt: vencido } }],
    },
    orderBy: { createdAt: "asc" },
    take: limite,
    select: { id: true, textoLibre: true, fotoPrincipalId: true, clave: true, dayLogId: true },
  });

  if (candidatas.length === 0) return res;

  const dishes = await loadDishContext();
  const grupoIdPorClave = new Map(
    (await prisma.foodGroup.findMany({ select: { id: true, clave: true } })).map((g) => [g.clave, g.id])
  );

  for (const entrada of candidatas) {
    const reclamo = await prisma.mealEntry.updateMany({
      where: {
        id: entrada.id,
        OR: [{ reclasificacionReclamadaEn: null }, { reclasificacionReclamadaEn: { lt: vencido } }],
      },
      data: { reclasificacionReclamadaEn: new Date() },
    });
    if (reclamo.count !== 1) continue; // otro tick se la llevó

    res.intentadas++;

    try {
      let imagen: { base64: string; mime: string } | null = null;
      if (entrada.fotoPrincipalId) {
        const foto = await prisma.mealPhoto.findUnique({
          where: { id: entrada.fotoPrincipalId },
          select: { datos: true, mime: true },
        });
        if (foto) imagen = { base64: Buffer.from(foto.datos).toString("base64"), mime: foto.mime };
      }

      const estimado = await estimatePortions({
        texto: entrada.textoLibre,
        imagen,
        dishes,
      });

      const porciones = estimado.estimacion.items.length
        ? estimado.estimacion.items.map((i, orden) => ({
            grupo: i.grupo,
            porciones: i.porciones,
            nombre: i.nombre,
            cantidad: i.cantidad ?? null,
            orden,
          }))
        : estimado.estimacion.porciones.map((p, orden) => ({
            grupo: p.grupo,
            porciones: p.porciones,
            nombre: p.detalle ?? null,
            cantidad: null,
            orden,
          }));

      await prisma.$transaction(async (tx) => {
        await tx.mealEntryPortion.deleteMany({ where: { mealEntryId: entrada.id } });

        for (const p of porciones) {
          const foodGroupId = grupoIdPorClave.get(p.grupo);
          const tasa = FOOD_GROUPS.find((g) => g.clave === p.grupo);
          if (!foodGroupId || !tasa || p.porciones <= 0) continue;
          await tx.mealEntryPortion.create({
            data: {
              id: crypto.randomUUID(),
              mealEntryId: entrada.id,
              foodGroupId,
              nombre: p.nombre,
              cantidad: p.cantidad,
              orden: p.orden,
              porciones: p.porciones,
              ...computePortionMacros(tasa, p.porciones),
            },
          });
        }

        await tx.mealEntry.update({
          where: { id: entrada.id },
          data: {
            estadoClasificacion: "clasificado",
            titulo: estimado.estimacion.titulo ?? undefined,
            confianzaIa: estimado.estimacion.confianza,
            modeloIa: estimado.modelo,
            estimacionIa: estimado.crudo as Prisma.InputJsonValue,
            dishId: estimado.dishId ?? undefined,
            reclasificacionReclamadaEn: null,
            ultimoErrorIa: null,
            version: { increment: 1 },
          },
        });

        // Sube la revisión del día para que la PWA lo recoja en su próxima
        // reconciliación (§5.4.2).
        await tx.dayLog.update({
          where: { id: entrada.dayLogId },
          data: { revision: { increment: 1 } },
        });
      });

      res.clasificadas++;
      logEvent("reclasificacion_ok", { mealEntryId: entrada.id, fuente: estimado.fuente });
    } catch (err) {
      res.fallidas++;
      const info = errorInfo(err);
      const intentos = await prisma.mealEntry.update({
        where: { id: entrada.id },
        data: {
          reclasificacionIntentos: { increment: 1 },
          reclasificacionReclamadaEn: null,
          ultimoErrorIa: err instanceof AiUnavailableError ? err.causa : info.msg.slice(0, 200),
        },
        select: { reclasificacionIntentos: true },
      });

      if (intentos.reclasificacionIntentos >= MAX_INTENTOS) {
        await prisma.mealEntry.update({
          where: { id: entrada.id },
          data: { estadoClasificacion: "fallido" },
        });
      }
      logEvent("reclasificacion_error", { mealEntryId: entrada.id, ...info });
    }
  }

  return res;
}
