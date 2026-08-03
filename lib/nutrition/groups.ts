import type { FoodGroupClave } from "@prisma/client";

// Macros por porción del Sistema Mexicano de Alimentos Equivalentes (§7.1).
// "leche" y "libre" no tienen FoodItem sembrados este ciclo (§10.2 no lista
// ítems para ninguno de los dos) — existen para completar el modelo y para
// que los componentes de platillo sin valor de intercambio (condimentos,
// verduras "libres") tengan un FoodGroup formal al que apuntar.
export const FOOD_GROUPS: {
  clave: FoodGroupClave;
  nombre: string;
  orden: number;
  color: string;
  kcal: number;
  proteinaG: number;
  carbosG: number;
  grasaG: number;
}[] = [
  { clave: "verdura", nombre: "Verdura", orden: 1, color: "#6bbf6b", kcal: 25, proteinaG: 2, carbosG: 4, grasaG: 0 },
  { clave: "fruta", nombre: "Fruta", orden: 2, color: "#e0a83d", kcal: 60, proteinaG: 0, carbosG: 15, grasaG: 0 },
  { clave: "cereal", nombre: "Cereal sin grasa", orden: 3, color: "#d9c46a", kcal: 70, proteinaG: 2, carbosG: 15, grasaG: 0 },
  { clave: "leguminosa", nombre: "Leguminosa", orden: 4, color: "#a97155", kcal: 120, proteinaG: 8, carbosG: 20, grasaG: 1 },
  { clave: "aoa_muy_bajo", nombre: "AOA muy bajo aporte de grasa", orden: 5, color: "#7de07d", kcal: 40, proteinaG: 7, carbosG: 0, grasaG: 1 },
  { clave: "aoa_bajo", nombre: "AOA bajo aporte de grasa", orden: 6, color: "#4fae4f", kcal: 55, proteinaG: 7, carbosG: 0, grasaG: 3 },
  { clave: "aoa_moderado", nombre: "AOA moderado aporte de grasa", orden: 7, color: "#2f7a2f", kcal: 75, proteinaG: 7, carbosG: 0, grasaG: 5 },
  { clave: "grasa_sin_proteina", nombre: "Grasa sin proteína", orden: 8, color: "#c98a4b", kcal: 45, proteinaG: 0, carbosG: 0, grasaG: 5 },
  { clave: "grasa_con_proteina", nombre: "Grasa con proteína", orden: 9, color: "#b06f36", kcal: 70, proteinaG: 3, carbosG: 3, grasaG: 5 },
  { clave: "leche", nombre: "Leche descremada", orden: 10, color: "#cfd8dc", kcal: 95, proteinaG: 9, carbosG: 12, grasaG: 2 },
  { clave: "libre", nombre: "Libre", orden: 11, color: "#9aa1ac", kcal: 0, proteinaG: 0, carbosG: 0, grasaG: 0 },
];

// Rollup de subgrupos a las 5 barras de la pantalla Hoy (§3.1). Decisión de
// interpretación #4 del plan: AOA (3 subgrupos) y Grasa (2 subgrupos) tienen
// un solo target agregado en §10.1 — esta constante de app (no de schema)
// define qué claves se suman bajo cada barra visible.
export const DISPLAY_GROUPS: { id: string; nombre: string; claves: FoodGroupClave[] }[] = [
  { id: "proteina", nombre: "Proteína", claves: ["aoa_muy_bajo", "aoa_bajo", "aoa_moderado"] },
  { id: "cereal", nombre: "Cereales", claves: ["cereal"] },
  { id: "grasa", nombre: "Grasas", claves: ["grasa_sin_proteina", "grasa_con_proteina"] },
  { id: "fruta", nombre: "Frutas", claves: ["fruta"] },
  { id: "verdura", nombre: "Verduras", claves: ["verdura"] },
];

// El target diario agregado (§10.1) se siembra completo contra un subgrupo
// representativo de cada barra; el resto del rollup queda en 0 — la suma es
// lo único que se muestra, la distribución interna es inerte para el target.
export const REPRESENTATIVE_CLAVE: Record<"proteina" | "grasa", FoodGroupClave> = {
  proteina: "aoa_muy_bajo",
  grasa: "grasa_sin_proteina",
};

// Nombre de la barra (§3.1) a la que pertenece cualquier subgrupo — usado
// para resumir los componentes de un platillo con las mismas 5 etiquetas
// que ve el atleta en Hoy, en vez de los 11 nombres técnicos de FoodGroup.
export function bucketNombreForClave(clave: FoodGroupClave): string {
  const bucket = DISPLAY_GROUPS.find((b) => b.claves.includes(clave));
  if (bucket) return bucket.nombre;
  // No todos los grupos tienen una de las 5 barras de Hoy (§3.1 solo muestra
  // proteína/cereal/grasa/fruta/verdura) — leguminosa, por ejemplo, se
  // etiqueta con su propio nombre de FoodGroup como respaldo.
  return FOOD_GROUPS.find((g) => g.clave === clave)?.nombre ?? clave;
}

export interface GroupMacros {
  kcal: number;
  proteinaG: number;
  carbosG: number;
  grasaG: number;
}

// Congela los macros de una porción contra la tasa del FoodGroup (§7.1) —
// el mismo cálculo lo usan los tres caminos de registro (A/B/C) y se guarda
// tal cual en MealEntryPortion; nunca se recalcula retroactivamente.
export function computePortionMacros(group: GroupMacros, porciones: number): GroupMacros {
  return {
    kcal: group.kcal * porciones,
    proteinaG: group.proteinaG * porciones,
    carbosG: group.carbosG * porciones,
    grasaG: group.grasaG * porciones,
  };
}
