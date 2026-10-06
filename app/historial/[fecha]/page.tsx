"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useHoyData } from "@/lib/hooks/useHoyData";
import { computeBarras, computeMacros } from "@/lib/nutrition/summary";
import { Screen } from "@/components/shell/Screen";
import { PortionBars } from "@/components/hoy/PortionBars";
import { DayHeader } from "@/components/hoy/DayHeader";
import { DaySlots } from "@/components/hoy/DaySlots";

// Detalle de cualquier día (§3.4). Misma lista que Hoy, incluido el `+`:
// un día pasado se podía leer y no se podía completar.
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

  return (
    <Screen>
      <Link href="/historial" className="flex items-center gap-1 text-sm text-muted">
        <ChevronLeft className="size-4" />
        Historial
      </Link>

      <DayHeader fecha={fecha} macros={macros} nEntradas={meals.length} />

      <DaySlots fecha={fecha} slots={plan?.slots ?? []} meals={meals} />

      <section className="border-t border-border pt-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Porciones</h2>
        <PortionBars barras={barras} />
      </section>
    </Screen>
  );
}
