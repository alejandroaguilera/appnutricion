import { updateDayLogField } from "@/lib/db/dayLogs";
import { saveMealEntry } from "@/lib/db/mealEntries";
import { computePortionMacros } from "@/lib/nutrition/groups";
import type { DayLogRecord, MealEntryRecord, MealEntryPortionRecord, PlanSlotRecord, FoodGroupRecord } from "@/lib/db/types";

export interface RegisterPortionInput {
  foodGroupId: string;
  foodItemId: string | null;
  porciones: number;
}

// Camino compartido por A, B y C (§3.2): las tres solo difieren en cómo se
// arma `portions` antes de llamar aquí. Todas escriben local primero, nunca
// piden confirmación de red — "no existe botón de guardar".
//
// El DayLog de hoy se crea si todavía no existe y se guarda ANTES de
// encolar el MealEntry, para que el outbox lo drene en ese orden (FIFO por
// `seq`) — el servidor exige que el DayLog ya exista (FK) cuando llega el
// PUT del MealEntry.
export async function registerMeal(params: {
  fecha: string;
  dayLog: DayLogRecord | null;
  slot: PlanSlotRecord;
  foodGroups: FoodGroupRecord[];
  dishId?: string | null;
  portionsInput: RegisterPortionInput[];
  origen?: "app" | "telegram" | "import";
}): Promise<DayLogRecord> {
  const { fecha, slot, foodGroups, dishId = null, portionsInput, origen = "app" } = params;

  // Si el DayLog de hoy ya existía, su PUT ya está encolado (o ya sincronizó)
  // desde antes — no hace falta volver a guardarlo. Si no existía, se crea y
  // se guarda ahora, para que su PUT quede en el outbox antes que el de esta
  // entrada.
  const dayLog = params.dayLog ?? (await updateDayLogField(fecha, null, {}));

  const groupById = new Map(foodGroups.map((g) => [g.id, g]));

  const portions: MealEntryPortionRecord[] = portionsInput
    .filter((p) => p.porciones > 0)
    .map((p) => {
      const group = groupById.get(p.foodGroupId);
      if (!group) throw new Error(`FoodGroup no encontrado en caché: ${p.foodGroupId}`);
      const macros = computePortionMacros(group, p.porciones);
      return {
        id: crypto.randomUUID(),
        mealEntryId: "", // se completa abajo una vez que se conoce el id de la entrada
        foodGroupId: p.foodGroupId,
        foodItemId: p.foodItemId,
        porciones: p.porciones,
        ...macros,
      };
    });

  const entry: MealEntryRecord = {
    id: crypto.randomUUID(),
    dayLogId: dayLog.id,
    planMealSlotId: slot.id,
    clave: slot.clave,
    horaRegistro: new Date(),
    dishId,
    textoLibre: null,
    fueraDeCasa: false,
    notas: null,
    version: 1,
    origen,
    actualizadoEn: new Date(),
  };

  const portionsWithEntryId = portions.map((p) => ({ ...p, mealEntryId: entry.id }));

  await saveMealEntry(entry, portionsWithEntryId);

  return dayLog;
}
