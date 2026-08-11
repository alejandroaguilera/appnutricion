import { macrosDePorcion, type MacrosPorPorcion } from "./groups";
import type { FoodGroupRecord, FoodItemRecord, MealEntryPortionRecord } from "@/lib/db/types";

export interface Equivalencia {
  titulo: string; // "Pechuga de pollo"
  unidad: string | null; // "1 porción = 30 g"
  aproximado: string; // "≈ 90 g · 120 kcal · 21 g P"
  kcal: number;
  proteinaG: number;
}

// Escala una medida casera cuando se puede hacer sin mentir. "1 pieza" × 3 se
// puede decir como "3 piezas"; "1/3 taza" × 3 no se convierte en "1 taza" de
// forma confiable (las fracciones del SMAE son aproximaciones), así que en ese
// caso se prefiere no decir nada a decir algo falso.
function escalarMedida(cantidadPorcion: string, porciones: number): string | null {
  const m = cantidadPorcion.trim().match(/^(\d+(?:\.\d+)?)\s+(pieza|piezas|rebanada|rebanadas|cucharada|cucharadas|cucharadita|cucharaditas|taza|tazas|cuadrito|cuadritos)$/i);
  if (!m) return null;
  const total = Number(m[1]) * porciones;
  if (!Number.isFinite(total) || total <= 0) return null;

  const redondeado = Math.round(total * 100) / 100;
  const singular = redondeado === 1;
  const base = m[2].toLowerCase().replace(/s$/, "");
  const plural = base === "taza" ? "tazas" : `${base}s`;
  return `${redondeado} ${singular ? base : plural}`;
}

// Responde a "¿cuánto es una porción?", que es exactamente lo que el editor
// nunca contestaba. La información ya existía: `FoodItem.cantidadPorcion` está
// poblado en los 152 ítems del catálogo, y las kcal por porción son una
// constante por grupo. Lo único que faltaba era enseñarlo.
//
// Los gramos solo se muestran cuando se conocen de verdad (22 de 152 ítems):
// el catálogo del SMAE habla en medidas caseras, no en peso, y un gramaje
// inventado sería peor que no mostrar ninguno.
// `propias` va aparte y no dentro de `portion` a propósito: en un
// MealEntryPortionRecord los campos kcal/proteinaG/… son el TOTAL ya congelado,
// mientras que aquí se esperan por porción. Mezclarlos multiplicaría dos veces.
export function equivalenciaDe(
  portion: Pick<MealEntryPortionRecord, "porciones" | "nombre" | "cantidad" | "foodGroupId">,
  foodItem: FoodItemRecord | null,
  group: FoodGroupRecord | null,
  propias?: MacrosPorPorcion | null
): Equivalencia {
  const macros = group
    ? macrosDePorcion(group, portion.porciones, propias)
    : { kcal: 0, proteinaG: 0, carbosG: 0, grasaG: 0 };

  const titulo = portion.nombre ?? foodItem?.nombre ?? group?.nombre ?? "Porción";

  const unidad = foodItem
    ? `1 porción = ${foodItem.cantidadPorcion}`
    : portion.cantidad
      ? `la IA estimó ${portion.cantidad}`
      : group
        ? `1 porción de ${group.nombre.toLowerCase()}`
        : null;

  // Preferencia de la cantidad mostrada: gramos reales > medida casera
  // escalada > nada.
  const gramos = foodItem?.cantidadGramos ? Math.round(foodItem.cantidadGramos * portion.porciones) : null;
  const escalada = foodItem ? escalarMedida(foodItem.cantidadPorcion, portion.porciones) : null;

  const partes = [
    gramos ? `${gramos} g` : escalada,
    `${Math.round(macros.kcal)} kcal`,
    macros.proteinaG >= 1 ? `${Math.round(macros.proteinaG)} g P` : null,
  ].filter(Boolean);

  return {
    titulo,
    unidad,
    aproximado: `≈ ${partes.join(" · ")}`,
    kcal: macros.kcal,
    proteinaG: macros.proteinaG,
  };
}

export function totalDe(
  portions: Pick<MealEntryPortionRecord, "kcal" | "proteinaG" | "carbosG" | "grasaG">[]
) {
  return portions.reduce(
    (a, p) => ({
      kcal: a.kcal + p.kcal,
      proteinaG: a.proteinaG + p.proteinaG,
      carbosG: a.carbosG + p.carbosG,
      grasaG: a.grasaG + p.grasaG,
    }),
    { kcal: 0, proteinaG: 0, carbosG: 0, grasaG: 0 }
  );
}
