"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Screen } from "@/components/shell/Screen";
import { Card } from "@/components/ui/card";
import type { RevisionSemanal } from "@/lib/nutrition/weeklyReview";

export default function RevisionSemanalPage() {
  const { inicio } = useParams<{ inicio: string }>();
  const [revision, setRevision] = useState<RevisionSemanal | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/semana/${inicio}`);
        if (res.ok) setRevision((await res.json()).revision);
      } finally {
        setCargando(false);
      }
    })();
  }, [inicio]);

  return (
    <Screen>
      <Link href="/historial" className="flex items-center gap-1 text-sm text-muted">
        <ChevronLeft className="size-4" />
        Historial
      </Link>

      <header>
        <h1 className="text-lg font-semibold text-foreground">Revisión semanal</h1>
        <p className="text-xs text-muted">Semana del {inicio}</p>
      </header>

      {cargando ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : !revision ? (
        <p className="text-sm text-muted">No hay datos para esa semana.</p>
      ) : (
        <>
          <Card className="p-4">
            <p className="text-sm text-muted">Días registrados</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-primary">
              {revision.diasRegistrados}
              <span className="text-base font-normal text-muted"> / 7</span>
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-medium text-muted">Promedios</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              {[
                ["Calorías", revision.kcalPromedio, "kcal"],
                ["Proteína", revision.proteinaPromedioG, "g"],
                ["Adherencia", revision.adherenciaPct, "%"],
                ["Peso (móvil 7d)", revision.pesoPromedioMovil7d, "kg"],
                ["Δ peso semana", revision.deltaPesoSemana, "kg"],
              ].map(([k, v, u]) => (
                <div key={k as string} className="contents">
                  <dt className="text-muted">{k as string}</dt>
                  <dd className="text-right tabular-nums text-foreground">
                    {v === null || v === undefined
                      ? "—"
                      : `${(v as number).toFixed(u === "kg" ? 2 : 0)} ${u as string}`}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Una sola desviación dominante (§3.5), no una lista de reproches. */}
          {revision.desviacionDominante && (
            <Card className="p-4">
              <h2 className="text-sm font-medium text-muted">Lo que más se movió</h2>
              <p className="mt-1 text-sm text-foreground">{revision.desviacionDominante}</p>
            </Card>
          )}

          <Card className="p-4">
            <h2 className="text-sm font-medium text-muted">Sugerencia</h2>
            <p className="mt-1 text-sm text-foreground">{revision.sugerencia}</p>
            <p className="mt-2 text-[11px] text-muted">
              La app sugiere y explica; el ajuste lo aplicas tú.
            </p>
          </Card>
        </>
      )}
    </Screen>
  );
}
