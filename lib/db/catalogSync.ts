import { getDB } from "./indexeddb";
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

    if (catalogRes.ok) {
      const { foodGroups, items }: { foodGroups: FoodGroupRecord[]; items: FoodItemRecord[] } =
        await catalogRes.json();
      const tx = db.transaction(["foodGroups", "catalog"], "readwrite");
      await Promise.all([
        ...foodGroups.map((g) => tx.objectStore("foodGroups").put(g)),
        ...items.map((i) => tx.objectStore("catalog").put(i)),
      ]);
      await tx.done;
    }

    if (dishesRes.ok) {
      const { dishes }: { dishes: DishRecord[] } = await dishesRes.json();
      const tx = db.transaction("dishes", "readwrite");
      await Promise.all(dishes.map((d) => tx.store.put(d)));
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

export async function getCachedDishes(): Promise<DishRecord[]> {
  const db = await getDB();
  const all = await db.getAll("dishes");
  return all.sort((a, b) => b.vecesUsado - a.vecesUsado);
}

export async function getCachedPlan(): Promise<PlanRecord | null> {
  const db = await getDB();
  const all = await db.getAll("plan");
  return all[0] ?? null;
}
