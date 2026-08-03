import type { FoodGroupClave, PlanMealSlotClave } from "@prisma/client";

// Plan vigente y distribución por slot, transcritos de §10.1.

export const ACTIVE_PLAN = {
  nombre: "Bloque 1 — Déficit moderado",
  vigenteDesde: "2026-07-31",
  activo: true,
  kcalObjetivo: 2070,
  proteinaG: 175,
  carbosG: 190,
  grasaG: 68,
  fibraG: 29,
  aguaL: 3.0,
};

// Target diario agregado por grupo. AOA y Grasa se siembran completos contra
// un subgrupo representativo (ver lib/nutrition/groups.ts, REPRESENTATIVE_CLAVE)
// ya que el schema no admite un target por "bucket" — la barra de la UI suma
// los subgrupos de DISPLAY_GROUPS. Verdura es un piso ("libre, mínimo 5"), no
// un techo — la UI lo trata distinto de una barra x/y normal.
export const DAILY_TARGETS: { clave: FoodGroupClave; porcionesDia: number }[] = [
  { clave: "aoa_muy_bajo", porcionesDia: 20 }, // target agregado de proteína (AOA)
  { clave: "cereal", porcionesDia: 7 },
  { clave: "fruta", porcionesDia: 3 },
  { clave: "verdura", porcionesDia: 5 }, // piso, no techo
  { clave: "leguminosa", porcionesDia: 1 },
  { clave: "grasa_sin_proteina", porcionesDia: 4 }, // target agregado de grasa
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
  { clave: "desayuno", nombre: "Desayuno", orden: 1, horaSugerida: "08:30", esOpcional: false, targets: { proteina: 4, cereal: 2, grasa: 1, fruta: 0, verdura: null } },
  { clave: "snack_am", nombre: "Snack AM", orden: 2, horaSugerida: "11:00", esOpcional: false, targets: { proteina: 2, cereal: 0, grasa: 0, fruta: 1, verdura: null } },
  { clave: "comida", nombre: "Comida", orden: 3, horaSugerida: "14:30", esOpcional: false, targets: { proteina: 6, cereal: 2, grasa: 1, fruta: 0, verdura: 2 } },
  { clave: "snack_pm", nombre: "Snack PM (pre-gym)", orden: 4, horaSugerida: "17:30", esOpcional: false, targets: { proteina: 1, cereal: 1, grasa: 1, fruta: 1, verdura: null } },
  { clave: "post_gym", nombre: "Post-gym", orden: 5, horaSugerida: "19:30", esOpcional: true, targets: { proteina: 3, cereal: 0, grasa: 0, fruta: 0, verdura: null } },
  { clave: "cena", nombre: "Cena", orden: 6, horaSugerida: "20:30", esOpcional: false, targets: { proteina: 4, cereal: 2, grasa: 1, fruta: 0, verdura: 2 } },
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
