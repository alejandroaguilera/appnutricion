import { getDB } from "./indexeddb";
import { newOutboxRecord } from "./outbox";
import { toFechaKey } from "./mappers";
import type { MealEntryRecord, MealEntryPortionRecord } from "./types";

// `fecha` viaja con la comida para que el servidor pueda resolver (o crear)
// su DayLog padre por clave natural. Sin ella, el PUT de una comida dependía
// de que el PUT de su día hubiera llegado antes y de que su `dayLogId` fuera
// el canónico — dos suposiciones que se rompen con más de un escritor.
export function toWire(
  record: MealEntryRecord,
  portions: MealEntryPortionRecord[],
  fecha: string
) {
  return {
    ...record,
    fecha: toFechaKey(fecha),
    horaRegistro: record.horaRegistro.toISOString(),
    actualizadoEn: record.actualizadoEn.toISOString(),
    archivadoEn: record.archivadoEn ? record.archivadoEn.toISOString() : null,
    portions,
  };
}

// Escribe el MealEntry + sus MealEntryPortion locales Y encola el evento de
// sync en una sola transacción — igual patrón que saveDayLog. Las porciones
// de ESTE MealEntry se reemplazan por completo (no es la regla "nunca
// reemplazar la lista del día" de §5.4, que aplica entre entradas de un día,
// no dentro de una sola entrada, que siempre las edita quien la escribió).
export async function saveMealEntry(
  record: MealEntryRecord,
  portions: MealEntryPortionRecord[],
  fecha: string
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["mealEntries", "mealEntryPortions", "outbox"], "readwrite");

  await tx.objectStore("mealEntries").put(record);

  const portionsStore = tx.objectStore("mealEntryPortions");
  const existing = await portionsStore.index("by-mealEntryId").getAllKeys(record.id);
  await Promise.all(existing.map((key) => portionsStore.delete(key)));
  await Promise.all(portions.map((p) => portionsStore.put(p)));

  await tx
    .objectStore("outbox")
    .add(
      newOutboxRecord(
        "PUT",
        `/api/days/${record.dayLogId}/meals/${record.id}`,
        toWire(record, portions, fecha)
      )
    );

  await tx.done;
}

// Edición: sube `version` y refresca `actualizadoEn`, que es la base de la
// resolución de conflictos de §5.4.5 — sin eso, una edición local nunca
// podría ganarle a una versión más vieja del servidor.
export async function updateMealEntry(
  record: MealEntryRecord,
  portions: MealEntryPortionRecord[],
  fecha: string
): Promise<MealEntryRecord> {
  const actualizado: MealEntryRecord = {
    ...record,
    version: record.version + 1,
    actualizadoEn: new Date(),
  };
  await saveMealEntry(actualizado, portions, fecha);
  return actualizado;
}

// Borrado LÓGICO (§5.4.4): un borrado físico es indistinguible de "aún no lo
// conozco" y produce resurrecciones al reconciliar.
export async function deleteMealEntry(record: MealEntryRecord, fecha: string): Promise<void> {
  const db = await getDB();
  const archivado: MealEntryRecord = {
    ...record,
    archivadoEn: new Date(),
    version: record.version + 1,
    actualizadoEn: new Date(),
  };

  const tx = db.transaction(["mealEntries", "mealEntryPortions", "outbox"], "readwrite");
  await tx.objectStore("mealEntries").put(archivado);

  const portionsStore = tx.objectStore("mealEntryPortions");
  const keys = await portionsStore.index("by-mealEntryId").getAllKeys(record.id);
  await Promise.all(keys.map((k) => portionsStore.delete(k)));

  await tx
    .objectStore("outbox")
    .add(
      newOutboxRecord("DELETE", `/api/days/${record.dayLogId}/meals/${record.id}`, {
        fecha: toFechaKey(fecha),
      })
    );

  await tx.done;
}

export async function getMealEntriesForDay(dayLogId: string): Promise<MealEntryRecord[]> {
  const db = await getDB();
  const todas = await db.getAllFromIndex("mealEntries", "by-dayLogId", dayLogId);
  return todas
    .filter((m) => !m.archivadoEn)
    .sort((a, b) => a.horaRegistro.getTime() - b.horaRegistro.getTime());
}

export async function getMealEntry(id: string): Promise<MealEntryRecord | undefined> {
  const db = await getDB();
  return db.get("mealEntries", id);
}

export async function getPortionsForMeal(mealEntryId: string): Promise<MealEntryPortionRecord[]> {
  const db = await getDB();
  const todas = await db.getAllFromIndex("mealEntryPortions", "by-mealEntryId", mealEntryId);
  return todas.sort((a, b) => a.orden - b.orden);
}
