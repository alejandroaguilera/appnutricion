import { getDB } from "./indexeddb";
import { toDishRecord } from "./mappers";
import { fusionarPlatillos } from "./dishes";
import type { FoodGroupRecord, FoodItemRecord, DishRecord, PlanRecord } from "./types";

// Hidrata IndexedDB desde el servidor — llamado al montar la app y al
// reconectar (`online`). Catálogo, platillos y plan vigente se sincronizan
// por adelantado (§4) para que el registro funcione completo offline. Un
// fallo de red aquí es silencioso a propósito: si ya hubo una hidratación
// previa, la app sigue funcionando con lo que ya está en IndexedDB.
export async function hydrateCatalog(): Promise<void> {
  const db = await getDB();

  try {
    const [catalogRes, dishesRes, planRes] = await Promise.all([
      fetch("/api/catalog"),
      fetch("/api/dishes"),
      fetch("/api/plan"),
    ]);

    // Se limpia antes de escribir: sin esto los ids viejos se acumulaban para
    // siempre si la base se resembraba, y una porción podía quedar apuntando
    // a un FoodGroup que ya no existe — un 422 de FK al sincronizar.
    if (catalogRes.ok) {
      const { foodGroups, items }: { foodGroups: FoodGroupRecord[]; items: FoodItemRecord[] } =
        await catalogRes.json();
      const tx = db.transaction(["foodGroups", "catalog"], "readwrite");
      await tx.objectStore("foodGroups").clear();
      await tx.objectStore("catalog").clear();
      await Promise.all([
        ...foodGroups.map((g) => tx.objectStore("foodGroups").put(g)),
        ...items.map((i) => tx.objectStore("catalog").put(i)),
      ]);
      await tx.done;
    }

    if (dishesRes.ok) {
      const { dishes }: { dishes: Record<string, unknown>[] } = await dishesRes.json();
      const servidor = dishes.map((d) => toDishRecord(d));
      const tx = db.transaction("dishes", "readwrite");
      const locales = (await tx.store.getAll()).map((d) => toDishRecord(d as unknown as Record<string, unknown>));
      const fusion = fusionarPlatillos(locales, servidor);
      await tx.store.clear();
      await Promise.all(fusion.map((d) => tx.store.put(d)));
      await tx.done;
    }

    if (planRes.ok) {
      const { plan }: { plan: PlanRecord | null } = await planRes.json();
      if (plan) {
        const tx = db.transaction("plan", "readwrite");
        await tx.store.clear(); // un solo plan activo a la vez
        await tx.store.put(plan);
        await tx.done;
      }
    }
  } catch {
    // sin red — se sigue sirviendo desde lo ya hidratado
  }
}

export async function getCachedFoodGroups(): Promise<FoodGroupRecord[]> {
  const db = await getDB();
  const all = await db.getAll("foodGroups");
  return all.sort((a, b) => a.orden - b.orden);
}

export async function getCachedCatalog(): Promise<FoodItemRecord[]> {
  const db = await getDB();
  return db.getAll("catalog");
}

function momento(d: DishRecord): number {
  return d.actualizadoEn instanceof Date ? d.actualizadoEn.getTime() : 0;
}

export async function getCachedDishes(): Promise<DishRecord[]> {
  const db = await getDB();
  const all = await db.getAll("dishes");
  return all
    .filter((d) => !d.archivadoEn)
    .sort((a, b) => {
      const aPropio = Boolean(a.creadoPorUsuario);
      const bPropio = Boolean(b.creadoPorUsuario);
      if (aPropio !== bPropio) return aPropio ? -1 : 1;
      // Lo que acabas de guardar queda arriba. Los del plan siguen por uso.
      if (aPropio) return momento(b) - momento(a);
      return b.vecesUsado - a.vecesUsado;
    });
}

export async function getCachedPlan(): Promise<PlanRecord | null> {
  const db = await getDB();
  const all = await db.getAll("plan");
  return all[0] ?? null;
}
