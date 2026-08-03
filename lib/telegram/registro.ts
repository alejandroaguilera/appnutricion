import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { estimatePortions } from "@/lib/ai/estimatePortions";
import { loadDishContext } from "@/lib/ai/dishContext";
import { AiUnavailableError } from "@/lib/ai/provider";
import { FOOD_GROUPS, computePortionMacros, DISPLAY_GROUPS } from "@/lib/nutrition/groups";
import { localDayString } from "@/lib/date";
import { logEvent } from "@/lib/log";
import { sendMessage, editMessageText, type InlineButton } from "./api";
import { tarjetaEstimacion, acuseRegistro } from "./mensajes";
import type { Estimacion } from "@/lib/ai/schema";
import type { PlanMealSlotClave } from "@prisma/client";

const SESION_MIN = 30;

export interface EstadoSesion {
  estimacion: Estimacion;
  slotClave: PlanMealSlotClave;
  fotoId: string | null;
  texto: string | null;
  dishId: string | null;
  crudo: unknown;
  modelo: string | null;
  messageId: number | null;
}

async function guardarSesion(chatId: string, estado: EstadoSesion): Promise<void> {
  await prisma.telegramSession.upsert({
    where: { chatId },
    create: {
      chatId,
      estado: estado as unknown as Prisma.InputJsonValue,
      expiraEn: new Date(Date.now() + SESION_MIN * 60_000),
    },
    update: {
      estado: estado as unknown as Prisma.InputJsonValue,
      expiraEn: new Date(Date.now() + SESION_MIN * 60_000),
    },
  });
}

export async function leerSesion(chatId: string): Promise<EstadoSesion | null> {
  const s = await prisma.telegramSession.findUnique({ where: { chatId } });
  if (!s) return null;
  if (s.expiraEn < new Date()) {
    await prisma.telegramSession.delete({ where: { chatId } }).catch(() => {});
    return null;
  }
  return s.estado as unknown as EstadoSesion;
}

export async function borrarSesion(chatId: string): Promise<void> {
  await prisma.telegramSession.delete({ where: { chatId } }).catch(() => {});
}

function macrosDe(estimacion: Estimacion) {
  return estimacion.porciones.reduce(
    (acc, p) => {
      const tasa = FOOD_GROUPS.find((g) => g.clave === p.grupo);
      if (!tasa) return acc;
      const m = computePortionMacros(tasa, p.porciones);
      return {
        kcal: acc.kcal + m.kcal,
        proteinaG: acc.proteinaG + m.proteinaG,
        carbosG: acc.carbosG + m.carbosG,
        grasaG: acc.grasaG + m.grasaG,
      };
    },
    { kcal: 0, proteinaG: 0, carbosG: 0, grasaG: 0 }
  );
}

const BOTONES: InlineButton[][] = [
  [
    { text: "✓ Confirmar", callback_data: "conf" },
    { text: "✏️ Ajustar", callback_data: "ajustar" },
    { text: "✗ Cancelar", callback_data: "cancel" },
  ],
];

// Propone una estimación y espera confirmación. "La confirmación es
// obligatoria, igual que en la app. Nunca se guarda una estimación sin que el
// atleta la vea. Es la misma regla del §3.2, sin excepciones por canal."
export async function proponerRegistro(args: {
  chatId: string;
  slotClave: PlanMealSlotClave;
  texto: string | null;
  fotoId: string | null;
  imagen: { base64: string; mime: string } | null;
}): Promise<void> {
  const slot = await prisma.planMealSlot.findFirst({
    where: { clave: args.slotClave, plan: { activo: true } },
    select: { nombre: true },
  });
  const slotNombre = slot?.nombre ?? args.slotClave;

  let estimado;
  try {
    estimado = await estimatePortions({
      texto: args.texto,
      imagen: args.imagen,
      slotNombre,
      dishes: await loadDishContext(),
    });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      // Nunca se descarta el registro (§3.2-D): se guarda pendiente con el
      // texto y la foto intactos, y el trabajo de reclasificación lo retoma.
      await guardarPendiente(args);
      await sendMessage(
        args.chatId,
        "Guardé tu registro, pero no pude estimar las porciones ahora mismo. " +
          "Lo intento de nuevo en cuanto pueda y te aviso."
      );
      return;
    }
    throw err;
  }

  const macros = macrosDe(estimado.estimacion);
  const texto = tarjetaEstimacion({
    slotClave: args.slotClave,
    slotNombre,
    estimacion: estimado.estimacion,
    macros,
  });

  const enviado = await sendMessage(args.chatId, texto, BOTONES);

  await guardarSesion(args.chatId, {
    estimacion: estimado.estimacion,
    slotClave: args.slotClave,
    fotoId: args.fotoId,
    texto: args.texto,
    dishId: estimado.dishId,
    crudo: estimado.crudo,
    modelo: estimado.modelo,
    messageId: enviado.ok ? enviado.result.message_id : null,
  });
}

async function resolverDia(fecha: string): Promise<string> {
  const f = new Date(`${fecha}T00:00:00.000Z`);
  const existente = await prisma.dayLog.findUnique({ where: { fecha: f }, select: { id: true } });
  if (existente) return existente.id;
  const creado = await prisma.dayLog.create({
    data: { id: crypto.randomUUID(), fecha: f, sincronizadoEn: new Date(), revision: 1 },
    select: { id: true },
  });
  return creado.id;
}

async function guardarPendiente(args: {
  slotClave: PlanMealSlotClave;
  texto: string | null;
  fotoId: string | null;
}): Promise<string> {
  const fecha = localDayString();
  const dayLogId = await resolverDia(fecha);
  const id = crypto.randomUUID();

  await prisma.mealEntry.create({
    data: {
      id,
      dayLogId,
      clave: args.slotClave,
      horaRegistro: new Date(),
      textoLibre: args.texto,
      titulo: args.texto?.slice(0, 60) ?? null,
      fotoPrincipalId: args.fotoId,
      estadoClasificacion: "pendiente",
      origen: "telegram",
    },
  });
  if (args.fotoId) {
    await prisma.mealPhoto.update({ where: { id: args.fotoId }, data: { mealEntryId: id } }).catch(() => {});
  }
  await prisma.dayLog.update({ where: { id: dayLogId }, data: { revision: { increment: 1 } } });
  return id;
}

// Confirma y escribe. El UUID lo genera el SERVIDOR (§5.4.6): solo los
// registros creados offline necesitan UUID de cliente. Al subir
// DayLog.revision, la PWA lo recoge en su próxima reconciliación.
export async function confirmarRegistro(chatId: string, sesion: EstadoSesion): Promise<void> {
  const fecha = localDayString();
  const dayLogId = await resolverDia(fecha);
  const mealEntryId = crypto.randomUUID();

  const grupoIdPorClave = new Map(
    (await prisma.foodGroup.findMany({ select: { id: true, clave: true } })).map((g) => [g.clave, g.id])
  );

  const fuente = sesion.estimacion.items.length
    ? sesion.estimacion.items.map((i, orden) => ({
        grupo: i.grupo,
        porciones: i.porciones,
        nombre: i.nombre,
        cantidad: i.cantidad ?? null,
        orden,
      }))
    : sesion.estimacion.porciones.map((p, orden) => ({
        grupo: p.grupo,
        porciones: p.porciones,
        nombre: p.detalle ?? null,
        cantidad: null,
        orden,
      }));

  await prisma.$transaction(async (tx) => {
    await tx.mealEntry.create({
      data: {
        id: mealEntryId,
        dayLogId,
        clave: sesion.slotClave,
        horaRegistro: new Date(),
        dishId: sesion.dishId,
        titulo: sesion.estimacion.titulo ?? null,
        textoLibre: sesion.texto,
        fotoPrincipalId: sesion.fotoId,
        confianzaIa: sesion.estimacion.confianza,
        modeloIa: sesion.modelo,
        estimacionIa: sesion.crudo as Prisma.InputJsonValue,
        estadoClasificacion: "clasificado",
        origen: "telegram",
      },
    });

    for (const p of fuente) {
      const foodGroupId = grupoIdPorClave.get(p.grupo);
      const tasa = FOOD_GROUPS.find((g) => g.clave === p.grupo);
      if (!foodGroupId || !tasa || p.porciones <= 0) continue;
      await tx.mealEntryPortion.create({
        data: {
          id: crypto.randomUUID(),
          mealEntryId,
          foodGroupId,
          nombre: p.nombre,
          cantidad: p.cantidad,
          orden: p.orden,
          porciones: p.porciones,
          ...computePortionMacros(tasa, p.porciones),
        },
      });
    }

    await tx.dayLog.update({ where: { id: dayLogId }, data: { revision: { increment: 1 } } });

    if (sesion.dishId) {
      await tx.dish.update({ where: { id: sesion.dishId }, data: { vecesUsado: { increment: 1 } } });
    }
    if (sesion.fotoId) {
      await tx.mealPhoto.update({ where: { id: sesion.fotoId }, data: { mealEntryId } });
    }
  });

  await borrarSesion(chatId);
  logEvent("tg_registro_confirmado", { mealEntryId, slot: sesion.slotClave });

  // Acuse corto con el acumulado del día (§6.7).
  const barras = await barrasDelDia(fecha);
  if (sesion.messageId) {
    await editMessageText(chatId, sesion.messageId, "✓ Registrado.");
  }
  await sendMessage(chatId, acuseRegistro(barras));
}

export async function barrasDelDia(
  fecha: string
): Promise<{ nombre: string; actual: number; objetivo: number; esLibre: boolean }[]> {
  const [dia, plan] = await Promise.all([
    prisma.dayLog.findUnique({
      where: { fecha: new Date(`${fecha}T00:00:00.000Z`) },
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
  ]);

  const portions = dia?.meals.flatMap((m) => m.portions) ?? [];

  return DISPLAY_GROUPS.map((bucket) => ({
    nombre: bucket.nombre,
    actual: portions
      .filter((p) => bucket.claves.includes(p.foodGroup.clave))
      .reduce((a, p) => a + p.porciones, 0),
    objetivo:
      plan?.targets
        .filter((t) => bucket.claves.includes(t.foodGroup.clave))
        .reduce((a, t) => a + t.porcionesDia, 0) ?? 0,
    esLibre: bucket.id === "verdura",
  }));
}

export function botonesAjuste(estimacion: Estimacion): InlineButton[][] {
  const filas: InlineButton[][] = estimacion.porciones
    .filter((p) => p.porciones >= 0)
    .slice(0, 6)
    .map((p) => [
      { text: "−", callback_data: `aj:${p.grupo}:-` },
      { text: `${bucketCorto(p.grupo)} ${p.porciones.toFixed(1)}`, callback_data: "noop" },
      { text: "+", callback_data: `aj:${p.grupo}:+` },
    ]);
  filas.push([
    { text: "✓ Confirmar", callback_data: "conf" },
    { text: "✗ Cancelar", callback_data: "cancel" },
  ]);
  return filas;
}

function bucketCorto(clave: string): string {
  const mapa: Record<string, string> = {
    aoa_muy_bajo: "Prot",
    aoa_bajo: "Prot",
    aoa_moderado: "Prot",
    cereal: "Cereal",
    fruta: "Fruta",
    verdura: "Verd",
    leguminosa: "Legum",
    grasa_sin_proteina: "Grasa",
    grasa_con_proteina: "Grasa+",
    leche: "Leche",
    libre: "Libre",
  };
  return mapa[clave] ?? clave;
}

export { guardarSesion, guardarPendiente, macrosDe };
