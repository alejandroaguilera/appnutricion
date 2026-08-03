"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { localDayString } from "@/lib/date";
import { Screen } from "@/components/shell/Screen";
import { Card } from "@/components/ui/card";
import { BarChart } from "@/components/charts/BarChart";
import { cn } from "@/lib/utils";

interface DiaAgregado {
  fecha: string;
  registrado: boolean;
  kcal: number;
  proteinaG: number;
  nEntradas: number;
  adherenciaPct: number | null;
  pesoKg: number | null;
}

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function restarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() - n);
  return localDayString(d);
}

// Semáforo neutro de 3 pasos (§7.4): sin rojo, sin ✗. El objetivo es 85-90%,
// no 100% — un umbral de perfección es el mecanismo por el que se abandona un
// plan, así que 88% se comunica como éxito.
function colorAdherencia(pct: number | null, registrado: boolean): string {
  if (!registrado) return "bg-surface-raised";
  if (pct === null) return "bg-muted/30";
  if (pct >= 85) return "bg-primary";
  if (pct >= 65) return "bg-primary/50";
  return "bg-muted/50";
}

export default function HistorialPage() {
  const hoy = localDayString();
  const [dias, setDias] = useState<DiaAgregado[]>([]);
  const [objetivo, setObjetivo] = useState({ kcal: 0, proteinaG: 0 });
  const [cargando, setCargando] = useState(true);

  const desde = useMemo(() => restarDias(hoy, 29), [hoy]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/historial?desde=${desde}&hasta=${hoy}`);
        if (res.ok) {
          const data = await res.json();
          setDias(data.dias);
          setObjetivo(data.objetivo);
        }
      } finally {
        setCargando(false);
      }
    })();
  }, [desde, hoy]);

  const porFecha = new Map(dias.map((d) => [d.fecha, d]));

  // Últimos 7 días, siempre completos aunque no haya registro.
  const ultimos7 = Array.from({ length: 7 }, (_, i) => {
    const fecha = restarDias(hoy, 6 - i);
    const d = porFecha.get(fecha);
    const dow = new Date(`${fecha}T12:00:00`).getDay();
    return {
      fecha,
      etiqueta: DIAS_CORTOS[dow],
      kcal: d?.kcal ?? 0,
      proteinaG: d?.proteinaG ?? 0,
    };
  });

  const ultimos30 = Array.from({ length: 30 }, (_, i) => {
    const fecha = restarDias(hoy, 29 - i);
    return { fecha, dia: porFecha.get(fecha) ?? null };
  });

  const registradosEstaSemana = ultimos7.filter((d) => (porFecha.get(d.fecha)?.nEntradas ?? 0) > 0).length;

  return (
    <Screen>
      <header>
        <h1 className="text-lg font-semibold text-foreground">Historial</h1>
        <p className="text-xs text-muted">Últimos 30 días</p>
      </header>

      {cargando ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : (
        <>
          {/* El indicador que más importa (§3.4). */}
          <Link href={`/historial/semana/${restarDias(hoy, 6)}`}>
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted">Días registrados esta semana</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums text-primary">
                    {registradosEstaSemana}
                    <span className="text-base font-normal text-muted"> / 7</span>
                  </p>
                </div>
                <span className="text-xs text-muted underline underline-offset-4">Ver revisión</span>
              </div>
            </Card>
          </Link>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-medium text-muted">Calorías</h2>
            <BarChart
              datos={ultimos7.map((d) => ({ etiqueta: d.etiqueta, valor: d.kcal }))}
              objetivo={objetivo.kcal}
              unidad="kcal"
            />
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-medium text-muted">Proteína</h2>
            <BarChart
              datos={ultimos7.map((d) => ({ etiqueta: d.etiqueta, valor: d.proteinaG }))}
              objetivo={objetivo.proteinaG}
              unidad="g"
            />
          </Card>

          <section>
            <h2 className="mb-2 text-sm font-medium text-muted">Adherencia</h2>
            <div className="grid grid-cols-7 gap-1.5">
              {ultimos30.map(({ fecha, dia }) => (
                <Link
                  key={fecha}
                  href={`/historial/${fecha}`}
                  title={`${fecha}${dia?.adherenciaPct != null ? ` · ${Math.round(dia.adherenciaPct)}%` : ""}`}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-md text-[10px] tabular-nums",
                    colorAdherencia(dia?.adherenciaPct ?? null, dia?.registrado ?? false),
                    dia?.registrado && (dia.adherenciaPct ?? 0) >= 85
                      ? "text-primary-foreground"
                      : "text-muted"
                  )}
                >
                  {fecha.slice(-2)}
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </Screen>
  );
}
