import { ensureDayLog } from "@/lib/db/dayLogs";
import { saveMealEntry } from "@/lib/db/mealEntries";
import { macrosDePorcion, type MacrosPorPorcion } from "@/lib/nutrition/groups";
import type {
  DayLogRecord,
  MealEntryRecord,
  MealEntryPortionRecord,
  PlanSlotRecord,
  FoodGroupRecord,
  EstadoClasificacion,
} from "@/lib/db/types";

export interface RegisterPortionInput extends MacrosPorPorcion {
  foodGroupId: string;
  foodItemId: string | null;
  porciones: number;
  nombre?: string | null;
  cantidad?: string | null;
}

// Camino compartido por todos los registros (§3.2): platillo guardado,
// repetir, estimación por IA y ajuste a mano solo difieren en cómo arman
// `portionsInput` antes de llamar aquí. Todas escriben local primero, nunca
// piden confirmación de red — "no existe botón de guardar".
//
// El DayLog del día lo resuelve `ensureDayLog`, que busca y crea en una sola
// transacción. Antes esta función recibía el `dayLog` desde estado de React
// y creaba uno nuevo si venía null — con el índice `by-fecha` envenenado eso
// significaba un día nuevo por cada registro, y todos menos el primero
// chocaban contra la restricción única del servidor.
export async function registerMeal(params: {
  fecha: string;
  slot: PlanSlotRecord;
  foodGroups: FoodGroupRecord[];
  dishId?: string | null;
  titulo?: string | null;
  textoLibre?: string | null;
  notas?: string | null;
  fueraDeCasa?: boolean;
  estadoClasificacion?: EstadoClasificacion;
  confianzaIa?: number | null;
  fotoPrincipalId?: string | null;
  portionsInput: RegisterPortionInput[];
  origen?: "app" | "telegram" | "import";
}): Promise<DayLogRecord> {
  const {
    fecha,
    slot,
    foodGroups,
    dishId = null,
    titulo = null,
    textoLibre = null,
    notas = null,
    fueraDeCasa = false,
    estadoClasificacion = "clasificado",
    confianzaIa = null,
    fotoPrincipalId = null,
    portionsInput,
    origen = "app",
  } = params;

  const dayLog = await ensureDayLog(fecha);

  const groupById = new Map(foodGroups.map((g) => [g.id, g]));

  const portions: MealEntryPortionRecord[] = portionsInput
    .filter((p) => p.porciones > 0)
    .map((p, i) => {
      const group = groupById.get(p.foodGroupId);
      if (!group) throw new Error(`FoodGroup no encontrado en caché: ${p.foodGroupId}`);
      const macros = macrosDePorcion(group, p.porciones, p);
      return {
        id: crypto.randomUUID(),
        mealEntryId: "", // se completa abajo una vez que se conoce el id de la entrada
        foodGroupId: p.foodGroupId,
        foodGroupClave: group.clave,
        foodItemId: p.foodItemId,
        nombre: p.nombre ?? null,
        cantidad: p.cantidad ?? null,
        orden: i,
        porciones: p.porciones,
        ...macros,
      };
    });

  const ahora = new Date();
  const entry: MealEntryRecord = {
    id: crypto.randomUUID(),
    dayLogId: dayLog.id,
    planMealSlotId: slot.id,
    clave: slot.clave,
    horaRegistro: ahora,
    dishId,
    titulo,
    textoLibre,
    fueraDeCasa,
    notas,
    version: 1,
    origen,
    estadoClasificacion,
    confianzaIa,
    fotoPrincipalId,
    archivadoEn: null,
    actualizadoEn: ahora,
  };

  const portionsWithEntryId = portions.map((p) => ({ ...p, mealEntryId: entry.id }));

  await saveMealEntry(entry, portionsWithEntryId, fecha);

  return dayLog;
}
