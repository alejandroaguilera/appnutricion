"use client";

import { Card } from "@/components/ui/card";
import { bucketNombreForClave } from "@/lib/nutrition/groups";
import type { DishRecord } from "@/lib/db/types";

function resumenComponentes(dish: DishRecord): string {
  const porBucket = new Map<string, number>();
  for (const c of dish.components) {
    if (c.foodGroup.clave === "libre") continue; // condimentos, sin valor de intercambio
    const nombre = bucketNombreForClave(c.foodGroup.clave);
    porBucket.set(nombre, (porBucket.get(nombre) ?? 0) + c.porciones);
  }
  return Array.from(porBucket.entries())
    .map(([nombre, porciones]) => `${porciones} ${nombre.toLowerCase()}`)
    .join(" · ");
}

// Camino A (§3.2) — el camino del 80%. Un toque registra el platillo
// completo, sin pantalla de confirmación intermedia.
export function PlatilloList({
  dishes,
  onSelect,
}: {
  dishes: DishRecord[];
  onSelect: (dish: DishRecord) => void;
}) {
  if (dishes.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {dishes.map((dish) => (
        <Card key={dish.id} className="overflow-hidden p-0">
          <button
            type="button"
            onClick={() => onSelect(dish)}
            className="flex w-full flex-col items-start gap-0.5 p-4 text-left transition-[background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.98]"
          >
            <span className="font-medium text-foreground">{dish.nombre}</span>
            <span className="text-xs text-muted">{resumenComponentes(dish)}</span>
          </button>
        </Card>
      ))}
    </div>
  );
}
