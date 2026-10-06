import type {
  DayLogRecord,
  MealEntryRecord,
  MealEntryPortionRecord,
  DishRecord,
  DishComponentRecord,
  PlanMealSlotClave,
  OrigenMealEntry,
  FoodGroupClave,
  TipoComida,
} from "./types";

// El bug que perdió los registros de agosto: el servidor mandaba `fecha` como
// ISO completo ("2026-08-03T00:00:00.000Z") y hydrateDay esparcía el objeto
// del servidor tal cual sobre la fila local. Como `fecha` es la clave del
// índice `by-fecha` de IndexedDB, el índice quedaba envenenado y la app no
// volvía a encontrar su propio día.
//
// La defensa no es "acordarse de convertir": es que NINGÚN objeto del
// servidor entre a IndexedDB sin pasar por aquí, eligiendo campos uno por uno.
// Un `...spread` de un objeto de red hacia un store es el patrón prohibido.

export function toFechaKey(v: string | Date | null | undefined): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v.slice(0, 10);
}

function toDate(v: string | Date | null | undefined): Date {
  return v instanceof Date ? v : new Date(String(v));
}

function toDateOrNull(v: string | Date | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  return toDate(v);
}

export function toDayLogRecord(raw: Record<string, unknown>): DayLogRecord {
  return {
    id: String(raw.id),
    fecha: toFechaKey(raw.fecha as string | Date),
    pesoCorporalKg: (raw.pesoCorporalKg as number | null) ?? null,
    aguaMl: (raw.aguaMl as number | null) ?? null,
    notas: (raw.notas as string | null) ?? null,
    animo1a5: (raw.animo1a5 as number | null) ?? null,
    hambre1a5: (raw.hambre1a5 as number | null) ?? null,
    cerradoEn: toDateOrNull(raw.cerradoEn as string | null),
    revision: (raw.revision as number | undefined) ?? 1,
  };
}

export function toMealEntryRecord(raw: Record<string, unknown>): MealEntryRecord {
  return {
    id: String(raw.id),
    dayLogId: String(raw.dayLogId),
    planMealSlotId: (raw.planMealSlotId as string | null) ?? null,
    clave: raw.clave as PlanMealSlotClave,
    horaRegistro: toDate(raw.horaRegistro as string | Date),
    dishId: (raw.dishId as string | null) ?? null,
    titulo: (raw.titulo as string | null) ?? null,
    textoLibre: (raw.textoLibre as string | null) ?? null,
    fueraDeCasa: Boolean(raw.fueraDeCasa),
    notas: (raw.notas as string | null) ?? null,
    version: (raw.version as number | undefined) ?? 1,
    origen: (raw.origen as OrigenMealEntry | undefined) ?? "app",
    estadoClasificacion:
      (raw.estadoClasificacion as MealEntryRecord["estadoClasificacion"] | undefined) ?? "clasificado",
    confianzaIa: (raw.confianzaIa as number | null) ?? null,
    fotoPrincipalId: (raw.fotoPrincipalId as string | null) ?? null,
    archivadoEn: toDateOrNull(raw.archivadoEn as string | null),
    actualizadoEn: toDate(raw.actualizadoEn as string | Date),
  };
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function toDishComponent(raw: Record<string, unknown>, dishId: string): DishComponentRecord {
  const foodGroup = raw.foodGroup as { clave?: FoodGroupClave } | undefined;
  const foodItem = raw.foodItem as { nombre?: string; cantidadPorcion?: string } | null | undefined;
  return {
    id: String(raw.id),
    dishId: raw.dishId ? String(raw.dishId) : dishId,
    foodItemId: (raw.foodItemId as string | null) ?? null,
    foodGroupId: String(raw.foodGroupId),
    porciones: Number(raw.porciones),
    notaLibre: (raw.notaLibre as string | null) ?? null,
    kcalPorPorcion: numOrNull(raw.kcalPorPorcion),
    proteinaGPorPorcion: numOrNull(raw.proteinaGPorPorcion),
    carbosGPorPorcion: numOrNull(raw.carbosGPorPorcion),
    grasaGPorPorcion: numOrNull(raw.grasaGPorPorcion),
    foodGroup: { clave: (foodGroup?.clave ?? "libre") as FoodGroupClave },
    foodItem: foodItem?.nombre
      ? { nombre: String(foodItem.nombre), cantidadPorcion: String(foodItem.cantidadPorcion ?? "") }
      : null,
  };
}

// Misma regla que el día y la comida: el JSON del servidor no entra a
// IndexedDB por spread. Un platillo trae `createdAt` y relaciones que el
// store no pide, y un Date serializado donde el cliente espera otra cosa
// vuelve a ser el bug del índice envenenado, solo que en otro store.
export function toDishRecord(raw: Record<string, unknown>): DishRecord {
  const id = String(raw.id);
  const components = Array.isArray(raw.components) ? raw.components : [];
  return {
    id,
    nombre: String(raw.nombre ?? ""),
    alias: Array.isArray(raw.alias) ? raw.alias.map(String) : [],
    tipoComida: (Array.isArray(raw.tipoComida) ? raw.tipoComida : []) as TipoComida[],
    vecesUsado: Number(raw.vecesUsado ?? 0),
    creadoPorUsuario: Boolean(raw.creadoPorUsuario),
    archivadoEn: toDateOrNull(raw.archivadoEn as string | Date | null),
    actualizadoEn: raw.actualizadoEn ? toDate(raw.actualizadoEn as string | Date) : new Date(0),
    components: components.map((c) => toDishComponent(c as Record<string, unknown>, id)),
  };
}

export function toPortionRecord(
  raw: Record<string, unknown>,
  mealEntryId?: string
): MealEntryPortionRecord {
  const grupo = raw.foodGroup as { clave?: FoodGroupClave } | undefined;
  return {
    id: String(raw.id),
    mealEntryId: mealEntryId ?? String(raw.mealEntryId),
    foodGroupId: String(raw.foodGroupId),
    // Denormalizada al escribir: si algún día se resiembra la base y cambian
    // los cuid, las barras de Hoy siguen leyendo bien sin depender del mapa
    // de ids en caché.
    foodGroupClave: (grupo?.clave ?? (raw.foodGroupClave as FoodGroupClave | undefined) ?? null) as
      | FoodGroupClave
      | null,
    foodItemId: (raw.foodItemId as string | null) ?? null,
    nombre: (raw.nombre as string | null) ?? null,
    cantidad: (raw.cantidad as string | null) ?? null,
    orden: (raw.orden as number | undefined) ?? 0,
    porciones: Number(raw.porciones),
    kcal: Number(raw.kcal),
    proteinaG: Number(raw.proteinaG),
    carbosG: Number(raw.carbosG),
    grasaG: Number(raw.grasaG),
  };
}
