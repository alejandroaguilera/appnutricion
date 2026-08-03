"use client";

import { useEffect, useState } from "react";
import { useHoyData } from "@/lib/hooks/useHoyData";
import { getCachedDishes } from "@/lib/db/catalogSync";
import { computeBarras, computeMacros } from "@/lib/nutrition/summary";
import { PortionBars } from "@/components/hoy/PortionBars";
import { MacroSummaryLine } from "@/components/hoy/MacroSummaryLine";
import { MealSlotCard, type SlotMealSummary } from "@/components/hoy/MealSlotCard";
import { WaterCounter } from "@/components/hoy/WaterCounter";
import { WeightTodayCard } from "@/components/hoy/WeightTodayCard";
import { DayNoteField } from "@/components/hoy/DayNoteField";
import type { DishRecord } from "@/lib/db/types";

export default function HoyPage() {
  const { loading, fecha, plan, foodGroups, dayLog, meals, refresh } = useHoyData();
  const [dishes, setDishes] = useState<DishRecord[]>([]);

  useEffect(() => {
    void getCachedDishes().then(setDishes);
  }, [meals]);

  if (loading) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p className="text-sm text-muted">Cargando…</p>
      </main>
    );
  }

  const allPortions = meals.flatMap((m) => m.portions);
  const barras = computeBarras(plan, foodGroups, allPortions);
  const macros = computeMacros(plan, allPortions);
  const groupNombreByClave = new Map(foodGroups.map((g) => [g.id, g.nombre]));
  const dishNombreById = new Map(dishes.map((d) => [d.id, d.nombre]));

  const mealsBySlot = new Map<string, SlotMealSummary[]>();
  for (const { entry, portions } of meals) {
    const titulo = entry.dishId ? dishNombreById.get(entry.dishId) ?? "Platillo" : "Porciones sueltas";
    const detalle = portions
      .filter((p) => p.porciones > 0)
      .map((p) => `${p.porciones} ${groupNombreByClave.get(p.foodGroupId) ?? ""}`.trim())
      .join(" · ");
    const kcal = portions.reduce((acc, p) => acc + p.kcal, 0);
    const list = mealsBySlot.get(entry.clave) ?? [];
    list.push({ id: entry.id, titulo, detalle, kcal, origen: entry.origen });
    mealsBySlot.set(entry.clave, list);
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-4 pb-24">
      <header>
        <h1 className="text-lg font-semibold text-foreground">Hoy</h1>
        <p className="text-xs text-muted">{fecha}</p>
      </header>

      <section>
        <PortionBars barras={barras} />
        <MacroSummaryLine macros={macros} />
      </section>

      <section className="flex flex-col gap-3">
        {plan?.slots.map((slot) => (
          <MealSlotCard key={slot.id} slot={slot} meals={mealsBySlot.get(slot.clave) ?? []} />
        ))}
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-4">
        <WaterCounter fecha={fecha} dayLog={dayLog} objetivoL={plan?.aguaL ?? 3} onChange={() => void refresh()} />
        <WeightTodayCard fecha={fecha} dayLog={dayLog} onChange={() => void refresh()} />
        <DayNoteField fecha={fecha} dayLog={dayLog} onChange={() => void refresh()} />
      </section>
    </main>
  );
}
