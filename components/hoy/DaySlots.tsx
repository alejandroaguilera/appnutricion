import Link from "next/link";
import { Plus } from "lucide-react";
import { localDayString } from "@/lib/date";
import { Card } from "@/components/ui/card";
import { MealRow } from "@/components/hoy/MealRow";
import type { MealWithPortions } from "@/lib/hooks/useHoyData";
import type { PlanSlotRecord } from "@/lib/db/types";

// Los tiempos del día, con el `+` siempre visible. Una segunda entrada en el
// mismo slot es lo normal. En un día pasado el enlace lleva la fecha: sin
// eso el historial se podía leer y no se podía completar (la cena olvidada).
export function DaySlots({
  fecha,
  slots,
  meals,
}: {
  fecha: string;
  slots: PlanSlotRecord[];
  meals: MealWithPortions[];
}) {
  const porSlot = new Map<string, MealWithPortions[]>();
  for (const m of meals) {
    porSlot.set(m.entry.clave, [...(porSlot.get(m.entry.clave) ?? []), m]);
  }

  const clavesDelPlan = new Set<string>(slots.map((s) => s.clave));
  const huerfanas = [...porSlot].filter(([clave]) => !clavesDelPlan.has(clave));
  const qs = fecha === localDayString() ? "" : `?fecha=${fecha}`;

  return (
    <section className="flex flex-col gap-3">
      {slots.map((slot) => {
        const delSlot = porSlot.get(slot.clave) ?? [];
        return (
          <Card key={slot.id} className="p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                {slot.nombre}
                {slot.esOpcional && <span className="normal-case font-normal"> · opcional</span>}
              </h2>
              <Link
                href={`/registrar/${slot.clave}${qs}`}
                aria-label={`Registrar en ${slot.nombre}`}
                className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground active:scale-95"
              >
                <Plus className="size-5" />
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
          </Card>
        );
      })}

      {/* Entradas cuyo tiempo ya no existe en el plan vigente. Siguen
          sumando; si no se ven, parecen un dato perdido. */}
      {huerfanas.map(([clave, delSlot]) => (
        <Card key={clave} className="p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {clave.replace(/_/g, " ")}
            <span className="normal-case font-normal"> · fuera del plan vigente</span>
          </h2>
          <ul className="mt-1">
            {delSlot.map(({ entry, portions }) => (
              <MealRow key={entry.id} entry={entry} portions={portions} slotNombre={clave} />
            ))}
          </ul>
        </Card>
      ))}
    </section>
  );
}
