import { getDB } from "@/lib/db/indexeddb";
import { getPortionsForMeal } from "@/lib/db/mealEntries";
import type { MealEntryRecord, MealEntryPortionRecord, PlanMealSlotClave } from "@/lib/db/types";

export interface FoundMeal {
  entry: MealEntryRecord;
  portions: MealEntryPortionRecord[];
}

function addDaysToFecha(fecha: string, delta: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Camino B (§3.2): "la repetición es la norma en la alimentación real, no la
// excepción". Busca solo en IndexedDB — funciona offline igual que el resto
// del registro.
export async function findYesterdayEntry(
  fechaHoy: string,
  clave: PlanMealSlotClave
): Promise<FoundMeal | null> {
  const db = await getDB();
  const fechaAyer = addDaysToFecha(fechaHoy, -1);
  const dayLog = await db.getFromIndex("dayLogs", "by-fecha", fechaAyer);
  if (!dayLog) return null;

  const entries = await db.getAllFromIndex("mealEntries", "by-dayLogId", dayLog.id);
  const entry = entries.find((e) => e.clave === clave);
  if (!entry) return null;

  return { entry, portions: await getPortionsForMeal(entry.id) };
}

export async function findLastEntry(fechaHoy: string, clave: PlanMealSlotClave): Promise<FoundMeal | null> {
  const db = await getDB();
  const allEntries = await db.getAll("mealEntries");
  const candidatos = allEntries
    .filter((e) => e.clave === clave)
    .sort((a, b) => b.horaRegistro.getTime() - a.horaRegistro.getTime());

  for (const entry of candidatos) {
    const dayLog = await db.get("dayLogs", entry.dayLogId);
    if (dayLog && dayLog.fecha !== fechaHoy) {
      return { entry, portions: await getPortionsForMeal(entry.id) };
    }
  }
  return null;
}
