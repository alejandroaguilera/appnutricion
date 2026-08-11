"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EditorPorciones, type PorcionEditable } from "./EditorPorciones";
import { cn } from "@/lib/utils";
import type { MacrosPorPorcion } from "@/lib/nutrition/groups";
import type { FoodGroupRecord, FoodItemRecord } from "@/lib/db/types";
import type { ResultadoEstimacion } from "./EntradaLibre";

export interface PorcionConfirmada extends MacrosPorPorcion {
  foodGroupId: string;
  // Obligatorio, no opcional: cuando faltaba, el payload salía sin la clave y
  // el servidor rechazaba el registro entero con un 422.
  foodItemId: string | null;
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
  foodItems,
  onConfirmar,
  onCancelar,
}: {
  resultado: ResultadoEstimacion;
  foodGroups: FoodGroupRecord[];
  foodItems: FoodItemRecord[];
  onConfirmar: (titulo: string, porciones: PorcionConfirmada[]) => Promise<void>;
  onCancelar: () => void;
}) {
  const { estimacion } = resultado;
  const nivel = tramo(estimacion.confianza);

  const idPorClave = useMemo(() => new Map(foodGroups.map((g) => [g.clave, g.id])), [foodGroups]);

  const [titulo, setTitulo] = useState(estimacion.titulo ?? "");
  const [porciones, setPorciones] = useState<PorcionEditable[]>(() =>
    estimacion.items
      .filter((i) => idPorClave.has(i.grupo))
      .map((i) => ({
        id: crypto.randomUUID(),
        foodGroupId: idPorClave.get(i.grupo) as string,
        foodItemId: null, // la IA describe, no elige del catálogo
        nombre: i.nombre,
        cantidad: i.cantidad ?? null,
        porciones: i.porciones,
        // Solo llegan pobladas para el grupo `libre` (`parseEstimacion` tira
        // las demás): una cerveza vale sus 95 kcal, no las 0 de la tasa.
        kcal: i.kcal,
        proteinaG: i.proteinaG,
        carbosG: i.carbosG,
        grasaG: i.grasaG,
      }))
  );
  const [guardando, setGuardando] = useState(false);

  const confirmar = async () => {
    setGuardando(true);
    try {
      await onConfirmar(
        titulo.trim(),
        porciones
          .filter((p) => p.porciones > 0)
          .map((p) => ({
            foodGroupId: p.foodGroupId,
            foodItemId: p.foodItemId,
            porciones: p.porciones,
            nombre: p.nombre,
            cantidad: p.cantidad,
            kcal: p.kcal,
            proteinaG: p.proteinaG,
            carbosG: p.carbosG,
            grasaG: p.grasaG,
          }))
      );
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

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted">Alimentos</h2>
        <EditorPorciones
          porciones={porciones}
          foodGroups={foodGroups}
          foodItems={foodItems}
          onChange={setPorciones}
        />
      </section>

      <div className="flex gap-2">
        <Button variant="ghost" size="lg" className="flex-1" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Button>
        <Button
          size="lg"
          className="flex-[2]"
          onClick={() => void confirmar()}
          disabled={guardando || porciones.every((p) => p.porciones <= 0)}
        >
          {guardando ? "Guardando…" : "Confirmar"}
        </Button>
      </div>
    </div>
  );
}
