"use client";

import { useHoyData } from "@/lib/hooks/useHoyData";
import { computeBarras, computeMacros } from "@/lib/nutrition/summary";
import { Screen } from "@/components/shell/Screen";
import { PortionBars } from "@/components/hoy/PortionBars";
import { DayHeader } from "@/components/hoy/DayHeader";
import { DaySlots } from "@/components/hoy/DaySlots";
import { WaterCounter } from "@/components/hoy/WaterCounter";
import { WeightTodayCard } from "@/components/hoy/WeightTodayCard";
import { DayNoteField } from "@/components/hoy/DayNoteField";

export default function HoyPage() {
  const { loading, fecha, plan, foodGroups, dayLog, meals, refresh } = useHoyData();

  if (loading) {
    return (
      <Screen>
        <p className="text-sm text-muted">Cargando…</p>
      </Screen>
    );
  }

  const allPortions = meals.flatMap((m) => m.portions);
  const barras = computeBarras(plan, foodGroups, allPortions);
  const macros = computeMacros(plan, allPortions);

  return (
    <Screen>
      {/* Macros del día (kcal · P · C · G): cómo voy contra el objetivo. */}
      <DayHeader fecha={fecha} macros={macros} nEntradas={meals.length} />

      <DaySlots fecha={fecha} slots={plan?.slots ?? []} meals={meals} />

      {/* Verificación del plan en intercambios SMAE — distinto de los macros
          de arriba: aquí se lee proteína/cereal/grasa/fruta/verdura en
          porciones, no en gramos. */}
      <section className="border-t border-border pt-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Porciones</h2>
        <PortionBars barras={barras} />
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-4">
        <WaterCounter fecha={fecha} dayLog={dayLog} objetivoL={plan?.aguaL ?? 3} onChange={() => void refresh()} />
        <WeightTodayCard fecha={fecha} dayLog={dayLog} onChange={() => void refresh()} />
        <DayNoteField fecha={fecha} dayLog={dayLog} onChange={() => void refresh()} />
      </section>
    </Screen>
  );
}
