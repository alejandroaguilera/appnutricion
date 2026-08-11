import type { FoodGroupClave, PlanMealSlotClave } from "@prisma/client";

// Plan vigente y distribución por slot. El §10.1 describe el Bloque 1; desde
// el 2026-08-10 rige el Bloque 2 (menú de la nutrióloga Alma Lomeli). El spec
// es el contrato de diseño y no se edita — el cambio de estado va aquí y en
// `ESTADO.md`.

/** El plan que sustituye este archivo. Lo necesita la migración de datos para
 * cerrarle la vigencia y desactivarlo (`NutritionPlan.activo` no es único). */
export const PLAN_ANTERIOR = {
  nombre: "Bloque 1 — Déficit moderado",
  vigenteHasta: "2026-08-09",
};

// El documento de Alma declara 1,890 kcal y no trae desglose de macros. Sus
// recetas, traducidas a porciones y valuadas con las tasas del SMAE, promedian
// 2,131 kcal/día (media de las opciones de cada tiempo: desayuno 504, comida
// 662, snack 418, cena 547).
//
// Se carga el promedio real y no el número declarado: un objetivo que el menú
// mismo no puede alcanzar dejaría la app marcando exceso todos los días aun
// siguiendo el plan al pie de la letra, que es justo lo que el §7.4 prohíbe.
// Proteína (164 vs ~158) y grasa (57 vs ~54) coinciden con lo estimado en
// `03-PLAN-NUTRICION.md`; la brecha está en carbohidratos y en el total.
export const ACTIVE_PLAN = {
  nombre: "Bloque 2 — Menú Alma Lomeli",
  vigenteDesde: "2026-08-10",
  activo: true,
  kcalObjetivo: 2130,
  proteinaG: 164,
  carbosG: 227,
  grasaG: 57,
  fibraG: 29,
  aguaL: 3.0,
  notas:
    "Menú de Alma Lomeli (consulta 2026-08-10). El documento declara 1,890 kcal " +
    "sin desglose de macros; sus recetas valuadas con SMAE promedian 2,130 kcal " +
    "(P164 / C227 / G57). Proteína y grasa coinciden con lo estimado, la " +
    "diferencia está en carbohidratos. Pendiente: pesar y registrar un día " +
    "completo para verificar contra el número declarado. 3 porciones de verdura " +
    "al día por documento; la app conserva el piso de 5 (§3.1, verdura libre).",
};

// Target diario agregado por grupo. AOA y Grasa se siembran completos contra
// un subgrupo representativo (ver lib/nutrition/groups.ts, REPRESENTATIVE_CLAVE)
// ya que el schema no admite un target por "bucket" — la barra de la UI suma
// los subgrupos de DISPLAY_GROUPS. Verdura es un piso ("libre, mínimo 5"), no
// un techo — la UI lo trata distinto de una barra x/y normal.
//
// Números del Bloque 2: promedio de las porciones de las 4 opciones completas.
export const DAILY_TARGETS: { clave: FoodGroupClave; porcionesDia: number }[] = [
  { clave: "aoa_muy_bajo", porcionesDia: 17 }, // target agregado de proteína (AOA)
  { clave: "cereal", porcionesDia: 8 },
  { clave: "fruta", porcionesDia: 3.5 },
  { clave: "verdura", porcionesDia: 5 }, // piso, no techo
  { clave: "leguminosa", porcionesDia: 1.5 },
  { clave: "grasa_sin_proteina", porcionesDia: 5.5 }, // target agregado de grasa
];

interface RawSlotTarget {
  proteina: number;
  cereal: number;
  grasa: number;
  fruta: number;
  /** null = sin target explícito para este slot (no significa cero). */
  verdura: number | null;
}

export const SLOTS: {
  clave: PlanMealSlotClave;
  nombre: string;
  orden: number;
  horaSugerida: string;
  esOpcional: boolean;
  targets: RawSlotTarget;
}[] = [
  { clave: "desayuno", nombre: "Desayuno", orden: 1, horaSugerida: "09:30", esOpcional: false, targets: { proteina: 3, cereal: 2, grasa: 2, fruta: 1, verdura: 1.5 } },
  { clave: "comida", nombre: "Comida", orden: 2, horaSugerida: "13:30", esOpcional: false, targets: { proteina: 6, cereal: 2.5, grasa: 0.5, fruta: 0, verdura: 2 } },
  { clave: "snack_pm", nombre: "Snack pre-gym", orden: 3, horaSugerida: "17:00", esOpcional: false, targets: { proteina: 2, cereal: 1.5, grasa: 1, fruta: 2.5, verdura: null } },
  // El menú de Alma no tiene tiempo post-entreno. Se conserva opcional y en
  // cero para que el scoop de los días de gym tenga dónde registrarse sin
  // contar como desviación contra el objetivo.
  { clave: "post_gym", nombre: "Post-gym", orden: 4, horaSugerida: "19:30", esOpcional: true, targets: { proteina: 0, cereal: 0, grasa: 0, fruta: 0, verdura: null } },
  { clave: "cena", nombre: "Cena", orden: 5, horaSugerida: "21:00", esOpcional: false, targets: { proteina: 6, cereal: 2, grasa: 2, fruta: 0, verdura: 1.5 } },
];

// slot.clave -> TipoComida usado para filtrar Dishes al registrar (§3.2 A).
// snack_am/snack_pm/post_gym son variantes de "snack" en el vocabulario más
// grueso de Dish.tipoComida (decisión de interpretación #6).
export const SLOT_TO_TIPO_COMIDA: Record<PlanMealSlotClave, "desayuno" | "comida" | "cena" | "snack"> = {
  desayuno: "desayuno",
  snack_am: "snack",
  comida: "comida",
  snack_pm: "snack",
  post_gym: "snack",
  cena: "cena",
};
