"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { normalize } from "@/lib/text";
import type { FoodItemRecord, FoodGroupRecord } from "@/lib/db/types";

// Busca en los 149 ítems del catálogo, ya cacheados en IndexedDB, así que
// funciona sin conexión. Usa la misma `normalize` que el emparejador de
// platillos (`lib/text.ts`): si las dos difirieran, "plátano" dejaría de
// encontrarse escribiendo "platano".
export function BuscadorAlimento({
  foodItems,
  foodGroups,
  onElegir,
  onCerrar,
}: {
  foodItems: FoodItemRecord[];
  foodGroups: FoodGroupRecord[];
  onElegir: (item: FoodItemRecord) => void;
  onCerrar: () => void;
}) {
  const [q, setQ] = useState("");

  const grupoPorId = useMemo(
    () => new Map(foodGroups.map((g) => [g.id, g])),
    [foodGroups]
  );

  const resultados = useMemo(() => {
    const consulta = normalize(q);
    if (!consulta) return foodItems.filter((i) => i.esFavorito).slice(0, 20);
    return foodItems
      .filter((i) => {
        const campos = [i.nombre, ...i.alias].map(normalize);
        return campos.some((c) => c.includes(consulta));
      })
      .slice(0, 40);
  }, [q, foodItems]);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <Search className="size-4 shrink-0 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar alimento…"
          className="h-10 w-full min-w-0 rounded-lg border border-border bg-surface-raised px-3 text-base text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <button type="button" onClick={onCerrar} aria-label="Cerrar búsqueda" className="shrink-0 text-muted">
          <X className="size-5" />
        </button>
      </div>

      {resultados.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          Sin resultados. Puedes agregarlo por grupo desde &ldquo;Ajustar por grupo&rdquo;.
        </p>
      ) : (
        <ul className="max-h-72 overflow-y-auto">
          {resultados.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onElegir(item)}
                className="flex w-full items-baseline justify-between gap-3 border-b border-border py-2.5 text-left last:border-0 active:bg-surface-raised"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{item.nombre}</span>
                  <span className="block truncate text-xs text-muted">
                    {grupoPorId.get(item.foodGroupId)?.nombre}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted">{item.cantidadPorcion}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
