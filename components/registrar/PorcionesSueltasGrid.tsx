"use client";

import { useState } from "react";
import { Stepper } from "@/components/ui/stepper";
import { Button } from "@/components/ui/button";
import type { FoodGroupRecord } from "@/lib/db/types";

// Camino C (§3.2): cuadrícula de grupos con +/-, permite medias porciones.
// "leche" y "libre" no tienen catálogo ni target este ciclo — se excluyen.
const EXCLUIDOS = new Set(["leche", "libre"]);

export function PorcionesSueltasGrid({
  foodGroups,
  onSubmit,
}: {
  foodGroups: FoodGroupRecord[];
  onSubmit: (porcionesPorGrupo: Map<string, number>) => Promise<void>;
}) {
  const grupos = foodGroups.filter((g) => !EXCLUIDOS.has(g.clave)).sort((a, b) => a.orden - b.orden);
  const [valores, setValores] = useState<Map<string, number>>(new Map());
  const [enviando, setEnviando] = useState(false);

  const total = Array.from(valores.values()).reduce((a, b) => a + b, 0);

  const handleSubmit = async () => {
    setEnviando(true);
    try {
      await onSubmit(valores);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {grupos.map((g) => (
          <Stepper
            key={g.id}
            label={g.nombre}
            value={valores.get(g.id) ?? 0}
            step={0.5}
            onChange={(v) => setValores((prev) => new Map(prev).set(g.id, v))}
          />
        ))}
      </div>
      <Button size="xl" disabled={total === 0 || enviando} onClick={() => void handleSubmit()}>
        {enviando ? "Registrando…" : "Registrar"}
      </Button>
    </div>
  );
}
