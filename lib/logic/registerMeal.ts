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
  /**
   * Entrada que ya existe y hay que sobrescribir en vez de crear otra.
   *
   * Es lo que permite reservar el registro ANTES de llamar al modelo: la
   * comida se guarda `pendiente` en cuanto el atleta pulsa estimar, y cuando
   * la estimación vuelve se completa ESTA misma entrada. Sin esto, confirmar
   * dejaba dos comidas donde hubo una.
   *
   * Se sube `version` y se refresca `actualizadoEn`, que es la base de la
   * resolución de conflictos del §5.4.5.
   */
  existente?: MealEntryRecord | null;
}): Promise<{ dayLog: DayLogRecord; entry: MealEntryRecord }> {
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
    existente = null,
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
  const base = {
    dishId,
    titulo,
    textoLibre,
    fueraDeCasa,
    notas,
    origen,
    estadoClasificacion,
    confianzaIa,
    fotoPrincipalId,
    actualizadoEn: ahora,
  };

  const entry: MealEntryRecord = existente
    ? // La hora de registro NO se toca: es cuándo comió, no cuándo se terminó
      // de clasificar. Reescribirla movería la comida de lugar en el día cada
      // vez que el modelo tarda.
      { ...existente, ...base, version: existente.version + 1 }
    : {
        id: crypto.randomUUID(),
        dayLogId: dayLog.id,
        planMealSlotId: slot.id,
        clave: slot.clave,
        horaRegistro: ahora,
        version: 1,
        archivadoEn: null,
        ...base,
      };

  const portionsWithEntryId = portions.map((p) => ({ ...p, mealEntryId: entry.id }));

  await saveMealEntry(entry, portionsWithEntryId, fecha);

  return { dayLog, entry };
}
