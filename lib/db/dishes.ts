import { getDB } from "./indexeddb";
import { newOutboxRecord } from "./outbox";
import type { DishComponentRecord, DishRecord, FoodGroupRecord, TipoComida } from "./types";
import type { MacrosPorPorcion } from "@/lib/nutrition/groups";

export interface PorcionParaGuardar extends MacrosPorPorcion {
  foodGroupId: string;
  foodItemId: string | null;
  porciones: number;
  nombre: string | null;
  cantidad: string | null;
}

// Lo que IndexedDB ya tiene y el servidor todavía no, o lo que el atleta ya
// quitó y el servidor sigue mandando porque el PUT de baja no llegó. Sin
// esto, hidratar el catálogo —que vacía el store y lo reescribe— borra una
// comida recién guardada o la resucita después de quitarla.
export function fusionarPlatillos(locales: DishRecord[], servidor: DishRecord[]): DishRecord[] {
  const servidorIds = new Set(servidor.map((d) => d.id));
  const localPorId = new Map(locales.map((d) => [d.id, d]));
  const resultado: DishRecord[] = [];

  for (const remoto of servidor) {
    const local = localPorId.get(remoto.id);
    if (!local?.creadoPorUsuario) {
      resultado.push(remoto);
      continue;
    }
    // La baja local gana mientras el servidor siga anunciando el platillo.
    if (local.archivadoEn && !remoto.archivadoEn) {
      resultado.push(local);
      continue;
    }
    resultado.push(local.actualizadoEn > remoto.actualizadoEn ? local : remoto);
  }

  for (const local of locales) {
    if (!local.creadoPorUsuario || servidorIds.has(local.id)) continue;
    // Si el servidor ya no lo manda y aquí está archivado, la baja llegó:
    // el tombstone deja de hacer falta.
    if (local.archivadoEn) continue;
    resultado.push(local);
  }

  return resultado;
}

function notaDePorcion(nombre: string | null, cantidad: string | null): string | null {
  const texto = [nombre, cantidad].filter(Boolean).join(" ").trim();
  return texto ? texto.slice(0, 160) : null;
}

export async function saveUserDish(params: {
  nombre: string;
  tipoComida: TipoComida;
  foodGroups: FoodGroupRecord[];
  portions: PorcionParaGuardar[];
}): Promise<DishRecord> {
  const groupById = new Map(params.foodGroups.map((g) => [g.id, g]));
  const ahora = new Date();
  const dishId = crypto.randomUUID();

  const components: DishComponentRecord[] = params.portions
    .filter((p) => p.porciones > 0 && groupById.has(p.foodGroupId))
    .map((p) => {
      const grupo = groupById.get(p.foodGroupId)!;
      const libre = grupo.clave === "libre" && typeof p.kcal === "number" && p.kcal > 0;
      return {
        id: crypto.randomUUID(),
        dishId,
        foodItemId: p.foodItemId,
        foodGroupId: p.foodGroupId,
        porciones: p.porciones,
        notaLibre: notaDePorcion(p.nombre, p.cantidad),
        kcalPorPorcion: libre ? (p.kcal ?? null) : null,
        proteinaGPorPorcion: libre ? (p.proteinaG ?? null) : null,
        carbosGPorPorcion: libre ? (p.carbosG ?? null) : null,
        grasaGPorPorcion: libre ? (p.grasaG ?? null) : null,
        foodGroup: { clave: grupo.clave },
        foodItem: null,
      };
    });

  const dish: DishRecord = {
    id: dishId,
    nombre: params.nombre.trim().slice(0, 120),
    alias: [],
    tipoComida: [params.tipoComida],
    vecesUsado: 0,
    creadoPorUsuario: true,
    archivadoEn: null,
    actualizadoEn: ahora,
    components,
  };

  await persistDish(dish);
  return dish;
}

// Borrado lógico. El platillo deja de ofrecerse; los registros que ya se
// hicieron con él siguen en su día.
export async function archiveUserDish(dish: DishRecord): Promise<DishRecord> {
  const archivado: DishRecord = {
    ...dish,
    archivadoEn: new Date(),
    actualizadoEn: new Date(),
  };
  await persistDish(archivado);
  return archivado;
}

export function dishToWire(dish: DishRecord) {
  return {
    id: dish.id,
    nombre: dish.nombre,
    tipoComida: dish.tipoComida,
    archivadoEn: dish.archivadoEn ? dish.archivadoEn.toISOString() : null,
    actualizadoEn: dish.actualizadoEn.toISOString(),
    components: dish.components.map((c) => ({
      id: c.id,
      foodGroupId: c.foodGroupId,
      foodItemId: c.foodItemId,
      porciones: c.porciones,
      notaLibre: c.notaLibre,
      kcalPorPorcion: c.kcalPorPorcion,
      proteinaGPorPorcion: c.proteinaGPorPorcion,
      carbosGPorPorcion: c.carbosGPorPorcion,
      grasaGPorPorcion: c.grasaGPorPorcion,
    })),
  };
}

async function persistDish(dish: DishRecord): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["dishes", "outbox"], "readwrite");
  await tx.objectStore("dishes").put(dish);
  await tx.objectStore("outbox").add(newOutboxRecord("PUT", `/api/dishes/${dish.id}`, dishToWire(dish)));
  await tx.done;
}

// Al repetir un platillo guardado, el nombre legible vive en `notaLibre`
// (la estimación no eligió un FoodItem). En un platillo del plan el nombre
// sale del catálogo y `notaLibre` es la cantidad del menú: no se pisan.
export function porcionesDesdePlatillo(dish: DishRecord): PorcionParaGuardar[] {
  return dish.components.map((c) => ({
    foodGroupId: c.foodGroupId,
    foodItemId: c.foodItemId,
    porciones: c.porciones,
    nombre: c.foodItem?.nombre ?? c.notaLibre,
    cantidad: c.foodItem?.cantidadPorcion ?? null,
    kcal: c.kcalPorPorcion,
    proteinaG: c.proteinaGPorPorcion,
    carbosG: c.carbosGPorPorcion,
    grasaG: c.grasaGPorPorcion,
  }));
}
