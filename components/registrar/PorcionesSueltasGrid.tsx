"use client";

import { useEffect, useState } from "react";
import { Stepper } from "@/components/ui/stepper";
import { Button } from "@/components/ui/button";
import type { FoodGroupRecord } from "@/lib/db/types";

// Cuadrícula de grupos con +/−, medias porciones incluidas.
//
// Ya NO es un camino de registro por sí sola — "las porciones sueltas no
// sirven para nada" — pero sigue siendo la mejor forma de AJUSTAR: es la
// cuadrícula "ya rellenada y editable" que el §3.2-D pide como pantalla de
// confirmación de una estimación por IA, y la que usa la pantalla de edición.
//
// "leche" y "libre" no tienen catálogo ni target este ciclo — se excluyen.
const EXCLUIDOS = new Set(["leche", "libre"]);

export function PorcionesSueltasGrid({
  foodGroups,
  onSubmit,
  valoresIniciales,
  onChange,
  textoBoton = "Registrar",
  mostrarBoton = true,
}: {
  foodGroups: FoodGroupRecord[];
  onSubmit?: (porcionesPorGrupo: Map<string, number>) => Promise<void>;
  valoresIniciales?: Map<string, number>;
  onChange?: (porcionesPorGrupo: Map<string, number>) => void;
  textoBoton?: string;
  mostrarBoton?: boolean;
}) {
  const grupos = foodGroups.filter((g) => !EXCLUIDOS.has(g.clave)).sort((a, b) => a.orden - b.orden);
  const [valores, setValores] = useState<Map<string, number>>(valoresIniciales ?? new Map());
  const [enviando, setEnviando] = useState(false);

  // Los valores iniciales llegan después del primer render (vienen de una
  // lectura async de IndexedDB o de la estimación de la IA).
  const firma = valoresIniciales ? JSON.stringify([...valoresIniciales.entries()].sort()) : "";
  useEffect(() => {
    if (!valoresIniciales) return;
    const copia = new Map(valoresIniciales);
    queueMicrotask(() => setValores(copia));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  const actualizar = (id: string, v: number) => {
    setValores((prev) => {
      const next = new Map(prev).set(id, v);
      onChange?.(next);
      return next;
    });
  };

  const total = Array.from(valores.values()).reduce((a, b) => a + b, 0);

  const handleSubmit = async () => {
    if (!onSubmit) return;
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
            onChange={(v) => actualizar(g.id, v)}
          />
        ))}
      </div>
      {mostrarBoton && onSubmit && (
        <Button size="xl" disabled={total === 0 || enviando} onClick={() => void handleSubmit()}>
          {enviando ? "Guardando…" : textoBoton}
        </Button>
      )}
    </div>
  );
}
