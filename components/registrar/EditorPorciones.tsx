"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Trash2, Link2 } from "lucide-react";
import { equivalenciaDe, totalDe } from "@/lib/nutrition/equivalencias";
import { computePortionMacros } from "@/lib/nutrition/groups";
import { BuscadorAlimento } from "./BuscadorAlimento";
import { PorcionesSueltasGrid } from "./PorcionesSueltasGrid";
import { Button } from "@/components/ui/button";
import type { FoodGroupRecord, FoodItemRecord } from "@/lib/db/types";

// Una porción editable, agnóstica de si viene de la IA, de un platillo o de
// una edición a mano.
export interface PorcionEditable {
  id: string;
  foodGroupId: string;
  foodItemId: string | null;
  nombre: string | null;
  cantidad: string | null;
  porciones: number;
}

// Editar comida por ALIMENTO, no por grupo abstracto.
//
// El editor anterior mostraba nueve contadores con los nombres técnicos de los
// grupos ("AOA muy bajo aporte de grasa") y un número pelado. Alejandro lo
// dijo directo: no sabe cuánto equivale una porción y no ve los gramos. La
// información existía desde el primer día en `FoodItem.cantidadPorcion` — el
// editor simplemente nunca la miraba, y de hecho el texto legible que sí se ve
// en la lista de Hoy desaparecía justo al abrir la edición.
//
// La cuadrícula por grupo se conserva plegada: sigue siendo la vía rápida para
// sumar algo que no está en el catálogo.
export function EditorPorciones({
  porciones,
  foodGroups,
  foodItems,
  onChange,
}: {
  porciones: PorcionEditable[];
  foodGroups: FoodGroupRecord[];
  foodItems: FoodItemRecord[];
  onChange: (p: PorcionEditable[]) => void;
}) {
  const [buscando, setBuscando] = useState(false);

  const grupoPorId = useMemo(() => new Map(foodGroups.map((g) => [g.id, g])), [foodGroups]);
  const itemPorId = useMemo(() => new Map(foodItems.map((i) => [i.id, i])), [foodItems]);

  const conMacros = porciones.map((p) => {
    const g = grupoPorId.get(p.foodGroupId);
    return { ...p, ...(g ? computePortionMacros(g, p.porciones) : { kcal: 0, proteinaG: 0, carbosG: 0, grasaG: 0 }) };
  });
  const total = totalDe(conMacros);

  const actualizar = (id: string, patch: Partial<PorcionEditable>) =>
    onChange(porciones.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const quitar = (id: string) => onChange(porciones.filter((p) => p.id !== id));

  const agregar = (item: FoodItemRecord) => {
    setBuscando(false);
    onChange([
      ...porciones,
      {
        id: crypto.randomUUID(),
        foodGroupId: item.foodGroupId,
        foodItemId: item.id,
        nombre: item.nombre,
        cantidad: item.cantidadPorcion,
        porciones: 1,
      },
    ]);
  };

  // La cuadrícula por grupo trabaja en agregados; al volver de ella se
  // conserva la porción existente del grupo y solo se ajusta su cantidad, para
  // no perder el nombre del alimento.
  const desdeGrupos = (mapa: Map<string, number>) => {
    const resultado: PorcionEditable[] = [];
    const porGrupo = new Map<string, PorcionEditable[]>();
    for (const p of porciones) {
      porGrupo.set(p.foodGroupId, [...(porGrupo.get(p.foodGroupId) ?? []), p]);
    }

    for (const [foodGroupId, valor] of mapa) {
      const existentes = porGrupo.get(foodGroupId) ?? [];
      const actual = existentes.reduce((a, p) => a + p.porciones, 0);
      if (valor <= 0) continue;

      if (existentes.length === 0) {
        resultado.push({
          id: crypto.randomUUID(),
          foodGroupId,
          foodItemId: null,
          nombre: null,
          cantidad: null,
          porciones: valor,
        });
      } else if (Math.abs(valor - actual) < 0.001) {
        resultado.push(...existentes); // sin cambios: se preservan tal cual
      } else {
        // Se ajusta la primera y se conservan las demás, en vez de colapsar
        // el grupo a una sola fila y perder los otros nombres.
        const [primera, ...resto] = existentes;
        const delta = valor - actual;
        resultado.push({ ...primera, porciones: Math.max(0, primera.porciones + delta) }, ...resto);
      }
    }
    onChange(resultado.filter((p) => p.porciones > 0));
  };

  const mapaGrupos = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of porciones) m.set(p.foodGroupId, (m.get(p.foodGroupId) ?? 0) + p.porciones);
    return m;
  }, [porciones]);

  return (
    <div className="flex flex-col gap-3">
      {porciones.length === 0 && !buscando && (
        <p className="py-3 text-center text-sm text-muted">Sin alimentos todavía.</p>
      )}

      <ul className="flex flex-col gap-2">
        {porciones.map((p) => {
          const item = p.foodItemId ? (itemPorId.get(p.foodItemId) ?? null) : null;
          const eq = equivalenciaDe(p, item, grupoPorId.get(p.foodGroupId) ?? null);
          return (
            <li key={p.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{eq.titulo}</p>
                  {eq.unidad && <p className="truncate text-xs text-muted">{eq.unidad}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => quitar(p.id)}
                  aria-label={`Quitar ${eq.titulo}`}
                  className="shrink-0 p-1 text-muted"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Restar porciones de ${eq.titulo}`}
                  onClick={() => actualizar(p.id, { porciones: Math.max(0, Math.round((p.porciones - 0.5) * 100) / 100) })}
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-raised active:bg-border"
                >
                  <Minus className="size-4" />
                </button>
                <input
                  type="number"
                  inputMode="decimal"
                  step={0.5}
                  min={0}
                  value={p.porciones}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isNaN(n)) actualizar(p.id, { porciones: Math.max(0, n) });
                  }}
                  aria-label={`Porciones de ${eq.titulo}`}
                  className="w-16 shrink-0 rounded-xl border border-border bg-surface-raised py-1.5 text-center text-lg font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <button
                  type="button"
                  aria-label={`Sumar porciones de ${eq.titulo}`}
                  onClick={() => actualizar(p.id, { porciones: Math.round((p.porciones + 0.5) * 100) / 100 })}
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-raised active:bg-border"
                >
                  <Plus className="size-4" />
                </button>
                <span className="min-w-0 flex-1 truncate text-right text-xs tabular-nums text-muted">
                  {eq.aproximado}
                </span>
              </div>

              {/* La IA no siempre identifica un ítem del catálogo. Enlazarlo
                  hace que aparezca la equivalencia real en vez del texto libre. */}
              {!p.foodItemId && (
                <button
                  type="button"
                  onClick={() => setBuscando(true)}
                  className="mt-2 flex items-center gap-1 text-xs text-muted underline underline-offset-4"
                >
                  <Link2 className="size-3" />
                  Enlazar con un alimento del catálogo
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {buscando ? (
        <BuscadorAlimento
          foodItems={foodItems}
          foodGroups={foodGroups}
          onElegir={agregar}
          onCerrar={() => setBuscando(false)}
        />
      ) : (
        <Button variant="secondary" size="lg" onClick={() => setBuscando(true)}>
          <Plus />
          Agregar alimento
        </Button>
      )}

      <div className="flex justify-between border-t border-border pt-3 text-sm tabular-nums">
        <span className="text-muted">Total</span>
        <span className="text-foreground">
          {Math.round(total.kcal)} kcal · P {Math.round(total.proteinaG)} · C{" "}
          {Math.round(total.carbosG)} · G {Math.round(total.grasaG)}
        </span>
      </div>

      <details className="rounded-xl border border-border bg-surface p-3">
        <summary className="cursor-pointer text-sm text-muted">Ajustar por grupo</summary>
        <div className="mt-3">
          <PorcionesSueltasGrid
            foodGroups={foodGroups}
            valoresIniciales={mapaGrupos}
            onChange={desdeGrupos}
            mostrarBoton={false}
          />
        </div>
      </details>
    </div>
  );
}
