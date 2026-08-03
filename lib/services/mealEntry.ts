import { prisma } from "@/lib/prisma";
import { mealEntrySchema, type MealEntryInput } from "@/lib/validation/mealEntry";

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
      include: { portions: true },
    });
  }

  return prisma.$transaction(async (tx) => {
    const mealEntry = await tx.mealEntry.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        dayLogId: data.dayLogId,
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
      where: { id: data.dayLogId },
      data: { revision: { increment: 1 } },
    });

    // Alimenta el orden "por frecuencia" del camino A (§3.2) — solo al crear,
    // nunca al reenviar/editar la misma entrada, para no inflar el conteo.
    if (!existing && data.dishId) {
      await tx.dish.update({ where: { id: data.dishId }, data: { vecesUsado: { increment: 1 } } });
    }

    return tx.mealEntry.findUniqueOrThrow({
      where: { id: mealEntry.id },
      include: { portions: true },
    });
  });
}
