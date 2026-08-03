import { getDB } from "./indexeddb";
import type { DayLogRecord, MealEntryRecord, MealEntryPortionRecord, PlanRecord } from "./types";

interface HoyApiResponse {
  fecha: string;
  plan: PlanRecord | null;
  dayLog:
    | (Omit<DayLogRecord, "cerradoEn"> & {
        cerradoEn: string | null;
        meals: (Omit<MealEntryRecord, "horaRegistro" | "actualizadoEn"> & {
          horaRegistro: string;
          actualizadoEn: string;
          portions: MealEntryPortionRecord[];
        })[];
      })
    | null;
}

// Trae el estado autoritativo del servidor para el día pedido y lo fusiona
// en IndexedDB. Con un solo escritor (la PWA) este ciclo, es una fusión
// simple sin conflictos reales que resolver — la reconciliación
// multi-escritor completa (§5.4, necesaria cuando Telegram escriba directo
// al servidor) es la siguiente ronda.
export async function hydrateDay(fecha: string): Promise<void> {
  let data: HoyApiResponse;
  try {
    const res = await fetch(`/api/hoy?fecha=${fecha}`);
    if (!res.ok) return;
    data = await res.json();
  } catch {
    return; // sin red — se sigue sirviendo desde IndexedDB
  }

  const db = await getDB();

  if (data.plan) {
    const tx = db.transaction("plan", "readwrite");
    await tx.store.clear();
    await tx.store.put(data.plan);
    await tx.done;
  }

  if (data.dayLog) {
    const { meals, cerradoEn, ...dayLogFields } = data.dayLog;
    const dayLogRecord: DayLogRecord = {
      ...dayLogFields,
      cerradoEn: cerradoEn ? new Date(cerradoEn) : null,
    };

    const tx = db.transaction(["dayLogs", "mealEntries", "mealEntryPortions"], "readwrite");
    await tx.objectStore("dayLogs").put(dayLogRecord);

    for (const meal of meals) {
      const { portions, horaRegistro, actualizadoEn, ...mealFields } = meal;
      const mealRecord: MealEntryRecord = {
        ...mealFields,
        horaRegistro: new Date(horaRegistro),
        actualizadoEn: new Date(actualizadoEn),
      };
      await tx.objectStore("mealEntries").put(mealRecord);
      for (const portion of portions) {
        await tx.objectStore("mealEntryPortions").put(portion);
      }
    }

    await tx.done;
  }
}
