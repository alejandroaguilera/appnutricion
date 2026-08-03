import { getDB } from "./indexeddb";
import { newOutboxRecord } from "./outbox";
import type { MealEntryRecord, MealEntryPortionRecord } from "./types";

export function toWire(record: MealEntryRecord, portions: MealEntryPortionRecord[]) {
  return {
    ...record,
    horaRegistro: record.horaRegistro.toISOString(),
    actualizadoEn: record.actualizadoEn.toISOString(),
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
  portions: MealEntryPortionRecord[]
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
    .add(newOutboxRecord("PUT", `/api/days/${record.dayLogId}/meals/${record.id}`, toWire(record, portions)));

  await tx.done;
}

export async function getMealEntriesForDay(dayLogId: string): Promise<MealEntryRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex("mealEntries", "by-dayLogId", dayLogId);
}

export async function getPortionsForMeal(mealEntryId: string): Promise<MealEntryPortionRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex("mealEntryPortions", "by-mealEntryId", mealEntryId);
}
