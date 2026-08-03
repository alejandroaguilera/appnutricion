"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PorcionesSueltasGrid } from "./PorcionesSueltasGrid";
import { Stepper } from "@/components/ui/stepper";
import { cn } from "@/lib/utils";
import type { FoodGroupRecord } from "@/lib/db/types";
import type { ResultadoEstimacion } from "./EntradaLibre";

export interface PorcionConfirmada {
  foodGroupId: string;
  porciones: number;
  nombre: string | null;
  cantidad: string | null;
}

// Tres tramos de confianza (§3.2-D). El de <0.5 NO ofrece aceptar de un
// toque: si el modelo no está seguro, el atleta tiene que mirar los números
// antes de que entren al registro.
function tramo(confianza: number): "alta" | "media" | "baja" {
  if (confianza >= 0.8) return "alta";
  if (confianza >= 0.5) return "media";
  return "baja";
}

export function ConfirmarEstimacion({
  resultado,
  foodGroups,
  onConfirmar,
  onCancelar,
}: {
  resultado: ResultadoEstimacion;
  foodGroups: FoodGroupRecord[];
  onConfirmar: (titulo: string, porciones: PorcionConfirmada[]) => Promise<void>;
  onCancelar: () => void;
}) {
  const { estimacion } = resultado;
  const nivel = tramo(estimacion.confianza);

  const idPorClave = useMemo(
    () => new Map(foodGroups.map((g) => [g.clave, g.id])),
    [foodGroups]
  );

  const [titulo, setTitulo] = useState(estimacion.titulo ?? "");
  const [items, setItems] = useState(() =>
    estimacion.items
      .filter((i) => idPorClave.has(i.grupo))
      .map((i) => ({
        nombre: i.nombre,
        cantidad: i.cantidad ?? null,
        foodGroupId: idPorClave.get(i.grupo) as string,
        porciones: i.porciones,
      }))
  );
  const [ajusteManual, setAjusteManual] = useState<Map<string, number> | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Si el usuario toca la cuadrícula por grupo, esa se vuelve la verdad y los
  // ítems pasan a ser solo descripción.
  const porGrupoDesdeItems = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.foodGroupId, (m.get(i.foodGroupId) ?? 0) + i.porciones);
    return m;
  }, [items]);

  const confirmar = async () => {
    setGuardando(true);
    try {
      const porciones: PorcionConfirmada[] = ajusteManual
        ? [...ajusteManual.entries()]
            .filter(([, v]) => v > 0)
            .map(([foodGroupId, v]) => {
              const item = items.find((i) => i.foodGroupId === foodGroupId);
              return {
                foodGroupId,
                porciones: v,
                nombre: item?.nombre ?? null,
                cantidad: item?.cantidad ?? null,
              };
            })
        : items
            .filter((i) => i.porciones > 0)
            .map((i) => ({
              foodGroupId: i.foodGroupId,
              porciones: i.porciones,
              nombre: i.nombre,
              cantidad: i.cantidad,
            }));
      await onConfirmar(titulo.trim(), porciones);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {resultado.fuente === "catalogo" ? (
        <p className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-foreground">
          Coincide con tu platillo guardado <strong>{estimacion.platilloCoincidente}</strong>.
        </p>
      ) : (
        nivel !== "alta" && (
          <p
            className={cn(
              "rounded-xl border p-3 text-xs",
              nivel === "media"
                ? "border-warning/40 bg-warning/10 text-warning"
                : "border-border bg-surface-raised text-muted"
            )}
          >
            {nivel === "media"
              ? "Estimación aproximada, revisa las cantidades."
              : "No quedó claro qué es. Revisa y ajusta antes de guardar."}
          </p>
        )
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">Nombre</span>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="¿Qué comiste?"
          className="h-11 rounded-xl border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </label>

      {items.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted">Alimentos</h2>
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{item.nombre}</p>
                {item.cantidad && <p className="text-xs text-muted">{item.cantidad}</p>}
              </div>
              <Stepper
                label=""
                value={item.porciones}
                step={0.5}
                onChange={(v) =>
                  setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, porciones: v } : it)))
                }
              />
            </div>
          ))}
        </section>
      )}

      <details className="rounded-xl border border-border bg-surface p-3">
        <summary className="cursor-pointer text-sm text-muted">Ajustar por grupo</summary>
        <div className="mt-3">
          {/* La cuadrícula de porciones, reutilizada como editor: es
              exactamente "la cuadrícula ya rellenada y editable" del §3.2-D. */}
          <PorcionesSueltasGrid
            foodGroups={foodGroups}
            valoresIniciales={ajusteManual ?? porGrupoDesdeItems}
            onChange={setAjusteManual}
            mostrarBoton={false}
          />
        </div>
      </details>

      <div className="flex gap-2">
        <Button variant="ghost" size="lg" className="flex-1" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Button>
        <Button size="lg" className="flex-[2]" onClick={() => void confirmar()} disabled={guardando}>
          {guardando ? "Guardando…" : "Confirmar"}
        </Button>
      </div>
    </div>
  );
}
