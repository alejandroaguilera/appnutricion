"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { bucketNombreForClave } from "@/lib/nutrition/groups";
import type { DishRecord } from "@/lib/db/types";

function resumenComponentes(dish: DishRecord): string {
  const nombres = dish.components.map((c) => c.notaLibre).filter((n): n is string => Boolean(n));
  // Una comida guardada desde una estimación no tiene FoodItem: el nombre
  // legible está en notaLibre. Un platillo del plan sí, y su notaLibre es la
  // cantidad del menú — ahí el resumen sigue siendo por grupo.
  if (dish.creadoPorUsuario && nombres.length > 0) return nombres.join(" · ");

  const porBucket = new Map<string, number>();
  for (const c of dish.components) {
    if (c.foodGroup.clave === "libre") continue;
    const nombre = bucketNombreForClave(c.foodGroup.clave);
    porBucket.set(nombre, (porBucket.get(nombre) ?? 0) + c.porciones);
  }
  return Array.from(porBucket.entries())
    .map(([nombre, porciones]) => `${porciones} ${nombre.toLowerCase()}`)
    .join(" · ");
}

// Camino A (§3.2) — un toque registra el platillo completo. `onQuitar` solo
// lo usan las comidas que el atleta guardó: quitarlas no borra registros.
export function PlatilloList({
  dishes,
  onSelect,
  onQuitar,
  vacio,
}: {
  dishes: DishRecord[];
  onSelect?: (dish: DishRecord) => void;
  onQuitar?: (dish: DishRecord) => void;
  vacio?: string;
}) {
  const [confirmando, setConfirmando] = useState<string | null>(null);

  if (dishes.length === 0) {
    return vacio ? <p className="py-3 text-sm text-muted">{vacio}</p> : null;
  }

  return (
    <div className="flex flex-col gap-2">
      {dishes.map((dish) => {
        const cuerpo = (
          <>
            <span className="font-medium text-foreground">{dish.nombre}</span>
            <span className="text-xs text-muted">{resumenComponentes(dish)}</span>
          </>
        );
        return (
          <Card key={dish.id} className="overflow-hidden p-0">
            <div className="flex items-stretch">
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(dish)}
                  className="flex min-w-0 flex-1 flex-col items-start gap-0.5 p-4 text-left transition-[background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.98]"
                >
                  {cuerpo}
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 p-4">{cuerpo}</div>
              )}
              {onQuitar && confirmando !== dish.id && (
                <button
                  type="button"
                  onClick={() => setConfirmando(dish.id)}
                  className="shrink-0 px-4 text-sm text-muted underline-offset-4 hover:underline"
                >
                  Quitar
                </button>
              )}
            </div>
            {onQuitar && confirmando === dish.id && (
              <div className="flex flex-col gap-2 border-t border-border px-4 py-3">
                <p className="text-xs text-muted">
                  ¿Quitar de Guardadas? Los registros que ya hiciste se quedan en su día.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmando(null);
                      onQuitar(dish);
                    }}
                    className="text-sm font-medium text-foreground underline underline-offset-4"
                  >
                    Quitar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmando(null)}
                    className="text-sm text-muted underline underline-offset-4"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
