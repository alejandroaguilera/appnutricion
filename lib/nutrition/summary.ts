import { DISPLAY_GROUPS } from "./groups";
import type { PlanRecord, FoodGroupRecord, MealEntryPortionRecord } from "@/lib/db/types";

export interface BarraResumen {
  id: string;
  nombre: string;
  actual: number;
  objetivo: number;
  esLibre: boolean; // verdura: piso, no techo (§3.1)
}

export interface MacroResumen {
  kcalActual: number;
  kcalObjetivo: number;
  proteinaActual: number;
  proteinaObjetivo: number;
  carbosActual: number;
  carbosObjetivo: number;
  grasaActual: number;
  grasaObjetivo: number;
}

// Jerarquía del §3.1: las 5 barras de porciones son lo grande; los macros
// son la línea chica de verificación. Ambas se derivan de las mismas
// portions congeladas del día — nunca de un recálculo contra tasas actuales.
export function computeBarras(
  plan: PlanRecord | null,
  foodGroups: FoodGroupRecord[],
  portions: MealEntryPortionRecord[]
): BarraResumen[] {
  const claveById = new Map(foodGroups.map((g) => [g.id, g.clave]));

  return DISPLAY_GROUPS.map((bucket) => {
    const objetivo =
      plan?.targets
        .filter((t) => bucket.claves.includes(t.foodGroup.clave))
        .reduce((acc, t) => acc + t.porcionesDia, 0) ?? 0;

    // `foodGroupClave` viene denormalizada en la porción; el mapa de ids es
    // solo respaldo para filas escritas antes de que existiera ese campo. Así
    // las barras no se vacían si algún día se resiembra el catálogo y los
    // cuid cambian.
    const actual = portions
      .filter((p) =>
        bucket.claves.includes((p.foodGroupClave ?? claveById.get(p.foodGroupId)) as never)
      )
      .reduce((acc, p) => acc + p.porciones, 0);

    return { id: bucket.id, nombre: bucket.nombre, actual, objetivo, esLibre: bucket.id === "verdura" };
  });
}

export function computeMacros(plan: PlanRecord | null, portions: MealEntryPortionRecord[]): MacroResumen {
  return {
    kcalActual: portions.reduce((acc, p) => acc + p.kcal, 0),
    kcalObjetivo: plan?.kcalObjetivo ?? 0,
    proteinaActual: portions.reduce((acc, p) => acc + p.proteinaG, 0),
    proteinaObjetivo: plan?.proteinaG ?? 0,
    carbosActual: portions.reduce((acc, p) => acc + p.carbosG, 0),
    carbosObjetivo: plan?.carbosG ?? 0,
    grasaActual: portions.reduce((acc, p) => acc + p.grasaG, 0),
    grasaObjetivo: plan?.grasaG ?? 0,
  };
}
