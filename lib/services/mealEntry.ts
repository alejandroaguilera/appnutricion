import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mealEntrySchema, type MealEntryInput } from "@/lib/validation/mealEntry";

type Tx = Prisma.TransactionClient;

// Resuelve el DayLog padre por su clave natural `fecha`, creándolo si hace
// falta. Antes el PUT de una comida asumía que el PUT de su día ya había
// llegado (FK) y que su `dayLogId` era el canónico; ninguna de las dos cosas
// es cierta con varios escritores. Si el día ya existe con otro id, gana el
// del servidor y la comida se cuelga de ese.
async function resolveDayLog(
  tx: Tx,
  args: { dayLogId: string; fecha: string | null | undefined }
): Promise<{ id: string }> {
  if (args.fecha) {
    const fecha = new Date(`${args.fecha}T00:00:00.000Z`);
    const existente = await tx.dayLog.findUnique({ where: { fecha }, select: { id: true } });
    if (existente) return existente;
    try {
      return await tx.dayLog.create({
        data: { id: args.dayLogId, fecha, sincronizadoEn: new Date(), revision: 1 },
        select: { id: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return tx.dayLog.findUniqueOrThrow({ where: { fecha }, select: { id: true } });
      }
      throw err;
    }
  }

  // Cliente viejo sin `fecha`: solo queda confiar en el id que mandó.
  return tx.dayLog.findUniqueOrThrow({ where: { id: args.dayLogId }, select: { id: true } });
}

// Idempotente por id. Guarda de versión: una escritura entrante solo
// sobrescribe si su version es >= la guardada, para que un reenvío atrasado
// (ej. el beacon de respaldo compitiendo con el drenado normal del outbox)
// no atropelle una edición más nueva — mismo patrón que setLog en appgym.
//
// Las porciones de ESTA entrada se reemplazan por completo (delete + create)
// en la misma transacción; el DayLog padre incrementa su `revision` en cada
// escritura de una de sus comidas, venga de donde venga (§5.4).
export async function upsertMealEntry(input: MealEntryInput) {
  const data = mealEntrySchema.parse(input);

  const existing = await prisma.mealEntry.findUnique({ where: { id: data.id } });
  if (existing && existing.version > data.version) {
    return prisma.mealEntry.findUniqueOrThrow({
      where: { id: data.id },
      include: mealEntryInclude,
    });
  }

  return prisma.$transaction(async (tx) => {
    const dayLog = await resolveDayLog(tx, { dayLogId: data.dayLogId, fecha: data.fecha });

    const mealEntry = await tx.mealEntry.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        dayLogId: dayLog.id,
        planMealSlotId: data.planMealSlotId,
        clave: data.clave,
        horaRegistro: new Date(data.horaRegistro),
        dishId: data.dishId,
        textoLibre: data.textoLibre,
        fueraDeCasa: data.fueraDeCasa,
        notas: data.notas,
        version: data.version,
        origen: data.origen,
      },
      update: {
        // Repunta la comida al día canónico: pudo haberse creado colgada de
        // un DayLog duplicado antes de que este arreglo existiera.
        dayLogId: dayLog.id,
        planMealSlotId: data.planMealSlotId,
        clave: data.clave,
        horaRegistro: new Date(data.horaRegistro),
        dishId: data.dishId,
        textoLibre: data.textoLibre,
        fueraDeCasa: data.fueraDeCasa,
        notas: data.notas,
        version: data.version,
        origen: data.origen,
      },
    });

    await tx.mealEntryPortion.deleteMany({ where: { mealEntryId: data.id } });
    if (data.portions.length > 0) {
      await tx.mealEntryPortion.createMany({
        data: data.portions.map((p) => ({
          id: p.id,
          mealEntryId: data.id,
          foodGroupId: p.foodGroupId,
          foodItemId: p.foodItemId,
          porciones: p.porciones,
          kcal: p.kcal,
          proteinaG: p.proteinaG,
          carbosG: p.carbosG,
          grasaG: p.grasaG,
        })),
      });
    }

    await tx.dayLog.update({
      where: { id: dayLog.id },
      data: { revision: { increment: 1 } },
    });

    // Alimenta el orden "por frecuencia" del camino A (§3.2) — solo al crear,
    // nunca al reenviar/editar la misma entrada, para no inflar el conteo.
    if (!existing && data.dishId) {
      await tx.dish.update({ where: { id: data.dishId }, data: { vecesUsado: { increment: 1 } } });
    }

    return tx.mealEntry.findUniqueOrThrow({
      where: { id: mealEntry.id },
      include: mealEntryInclude,
    });
  });
}

// Include compartido por todas las lecturas de comidas, para que el cliente
// siempre reciba la misma forma (incluida `foodGroup.clave`, que el cliente
// denormaliza y le permite sobrevivir a un resembrado del catálogo).
export const mealEntryInclude = {
  portions: {
    orderBy: { orden: "asc" },
    include: { foodGroup: { select: { clave: true, nombre: true } } },
  },
  dish: { select: { id: true, nombre: true } },
} as const;

type MealEntryConPortions = Prisma.MealEntryGetPayload<{ include: typeof mealEntryInclude }>;

export function serializeMealEntry(row: MealEntryConPortions) {
  return {
    id: row.id,
    dayLogId: row.dayLogId,
    planMealSlotId: row.planMealSlotId,
    clave: row.clave,
    horaRegistro: row.horaRegistro.toISOString(),
    dishId: row.dishId,
    titulo: row.titulo ?? row.dish?.nombre ?? null,
    textoLibre: row.textoLibre,
    fueraDeCasa: row.fueraDeCasa,
    notas: row.notas,
    version: row.version,
    origen: row.origen,
    estadoClasificacion: row.estadoClasificacion,
    confianzaIa: row.confianzaIa,
    fotoPrincipalId: row.fotoPrincipalId,
    archivadoEn: row.archivadoEn ? row.archivadoEn.toISOString() : null,
    actualizadoEn: row.actualizadoEn.toISOString(),
    portions: row.portions.map((p) => ({
      id: p.id,
      mealEntryId: p.mealEntryId,
      foodGroupId: p.foodGroupId,
      foodGroupClave: p.foodGroup.clave,
      foodItemId: p.foodItemId,
      nombre: p.nombre,
      cantidad: p.cantidad,
      orden: p.orden,
      porciones: p.porciones,
      kcal: p.kcal,
      proteinaG: p.proteinaG,
      carbosG: p.carbosG,
      grasaG: p.grasaG,
    })),
  };
}

// Borrado LÓGICO (§5.4.4). Idempotente: borrar dos veces devuelve lo mismo.
// Guarda un snapshot en la bitácora antes de archivar — §5.4.5 pide que la
// versión anterior quede registrada, no que desaparezca.
export async function archiveMealEntry(id: string, motivo = "borrado") {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.mealEntry.findUnique({ where: { id }, include: mealEntryInclude });
    if (!existente) return null;

    if (!existente.archivadoEn) {
      await tx.mealEntryAudit.create({
        data: { mealEntryId: id, motivo, snapshot: serializeMealEntry(existente) as object },
      });
      await tx.mealEntry.update({
        where: { id },
        data: { archivadoEn: new Date(), version: { increment: 1 } },
      });
      await tx.dayLog.update({
        where: { id: existente.dayLogId },
        data: { revision: { increment: 1 } },
      });
    }

    return tx.mealEntry.findUniqueOrThrow({ where: { id }, include: mealEntryInclude });
  });
}
