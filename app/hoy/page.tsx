"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useHoyData } from "@/lib/hooks/useHoyData";
import { computeBarras, computeMacros } from "@/lib/nutrition/summary";
import { Screen } from "@/components/shell/Screen";
import { PortionBars } from "@/components/hoy/PortionBars";
import { MacroSummaryLine } from "@/components/hoy/MacroSummaryLine";
import { DayHeader } from "@/components/hoy/DayHeader";
import { MealRow } from "@/components/hoy/MealRow";
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

  const porSlot = new Map<string, typeof meals>();
  for (const m of meals) {
    porSlot.set(m.entry.clave, [...(porSlot.get(m.entry.clave) ?? []), m]);
  }

  return (
    <Screen>
      <DayHeader fecha={fecha} macros={macros} nEntradas={meals.length} />

      {/* Lo que se comió, en renglones legibles: la superficie principal. */}
      <section className="flex flex-col gap-4">
        {plan?.slots.map((slot) => {
          const delSlot = porSlot.get(slot.clave) ?? [];
          return (
            <div key={slot.id}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {slot.nombre}
                  {slot.esOpcional && <span className="normal-case font-normal"> · opcional</span>}
                </h2>
                {/* Siempre visible: una segunda entrada en el mismo slot es lo
                    normal, no la excepción. Antes el `+` desaparecía en cuanto
                    había un registro y no había forma de agregar otro. */}
                <Link
                  href={`/registrar/${slot.clave}`}
                  aria-label={`Registrar en ${slot.nombre}`}
                  className="flex size-8 items-center justify-center rounded-full border border-border text-muted active:scale-95"
                >
                  <Plus className="size-4" />
                </Link>
              </div>

              {delSlot.length > 0 ? (
                <ul className="mt-1">
                  {delSlot.map(({ entry, portions }) => (
                    <MealRow key={entry.id} entry={entry} portions={portions} slotNombre={slot.nombre} />
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-sm text-muted">Pendiente</p>
              )}
            </div>
          );
        })}
      </section>

      {/* Verificación contra el plan: el plan se ejecuta en porciones (§3.1). */}
      <section className="border-t border-border pt-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Porciones</h2>
        <PortionBars barras={barras} />
        <MacroSummaryLine macros={macros} />
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-4">
        <WaterCounter fecha={fecha} dayLog={dayLog} objetivoL={plan?.aguaL ?? 3} onChange={() => void refresh()} />
        <WeightTodayCard fecha={fecha} dayLog={dayLog} onChange={() => void refresh()} />
        <DayNoteField fecha={fecha} dayLog={dayLog} onChange={() => void refresh()} />
      </section>
    </Screen>
  );
}
