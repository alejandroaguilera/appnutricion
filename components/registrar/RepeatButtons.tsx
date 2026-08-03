"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { findYesterdayEntry, findLastEntry, type FoundMeal } from "@/lib/logic/repeatMeal";
import type { PlanMealSlotClave } from "@/lib/db/types";

// Camino B (§3.2): "Igual que ayer" / "Igual que la última vez". Cada toque
// vuelve a congelar los macros contra las tasas ACTUALES del FoodGroup — no
// copia los valores viejos — porque cada repetición es su propio evento de
// registro (delegado a registerMeal, igual que los caminos A y C).
export function RepeatButtons({
  fecha,
  clave,
  onRepeat,
}: {
  fecha: string;
  clave: PlanMealSlotClave;
  onRepeat: (found: FoundMeal) => void;
}) {
  const [ayer, setAyer] = useState<FoundMeal | null>(null);
  const [ultima, setUltima] = useState<FoundMeal | null>(null);

  useEffect(() => {
    void findYesterdayEntry(fecha, clave).then(setAyer);
    void findLastEntry(fecha, clave).then(setUltima);
  }, [fecha, clave]);

  if (!ayer && !ultima) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {ayer && (
        <Button variant="secondary" size="sm" onClick={() => onRepeat(ayer)}>
          Igual que ayer
        </Button>
      )}
      {ultima && ultima.entry.id !== ayer?.entry.id && (
        <Button variant="secondary" size="sm" onClick={() => onRepeat(ultima)}>
          Igual que la última vez
        </Button>
      )}
    </div>
  );
}
