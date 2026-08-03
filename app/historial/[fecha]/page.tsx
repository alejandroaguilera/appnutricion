"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useHoyData } from "@/lib/hooks/useHoyData";
import { computeBarras, computeMacros } from "@/lib/nutrition/summary";
import { Screen } from "@/components/shell/Screen";
import { PortionBars } from "@/components/hoy/PortionBars";
import { MacroSummaryLine } from "@/components/hoy/MacroSummaryLine";
import { DayHeader } from "@/components/hoy/DayHeader";
import { MealRow } from "@/components/hoy/MealRow";

// Detalle editable de cualquier día (§3.4). Reutiliza useHoyData, que ya
// estaba parametrizado por fecha; cada renglón lleva a la misma pantalla de
// edición que en Hoy.
export default function DiaHistorialPage() {
  const { fecha } = useParams<{ fecha: string }>();
  const { loading, plan, foodGroups, meals } = useHoyData(fecha);

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
  const nombreSlot = new Map((plan?.slots ?? []).map((s) => [s.clave, s.nombre]));

  return (
    <Screen>
      <Link href="/historial" className="flex items-center gap-1 text-sm text-muted">
        <ChevronLeft className="size-4" />
        Historial
      </Link>

      <DayHeader fecha={fecha} macros={macros} nEntradas={meals.length} />

      {meals.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Sin registros este día.</p>
      ) : (
        <ul>
          {meals.map(({ entry, portions }) => (
            <MealRow
              key={entry.id}
              entry={entry}
              portions={portions}
              slotNombre={nombreSlot.get(entry.clave) ?? entry.clave}
            />
          ))}
        </ul>
      )}

      <section className="border-t border-border pt-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Porciones</h2>
        <PortionBars barras={barras} />
        <MacroSummaryLine macros={macros} />
      </section>
    </Screen>
  );
}
