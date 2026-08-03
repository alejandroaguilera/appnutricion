import type { BarraResumen } from "@/lib/nutrition/summary";
import { cn } from "@/lib/utils";

function formatPorciones(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// §3.1 — jerarquía deliberada: esta es la pieza grande de la pantalla.
// Verdura es un piso ("libre, mínimo 5"), nunca una barra x/y con techo.
function Barra({ barra }: { barra: BarraResumen }) {
  if (barra.esLibre) {
    const cumplida = barra.actual >= barra.objetivo;
    return (
      <div className="flex items-center justify-between gap-3 py-1.5">
        <span className="w-20 shrink-0 text-sm font-medium text-foreground">{barra.nombre}</span>
        <div className="flex-1" />
        <span className={cn("text-sm tabular-nums", cumplida ? "text-primary" : "text-muted")}>
          {formatPorciones(barra.actual)} / libre {cumplida ? "✓" : ""}
        </span>
      </div>
    );
  }

  const total = Math.max(barra.objetivo, 1);
  const llenos = Math.min(Math.round(barra.actual), total);
  const dots = Array.from({ length: total }, (_, i) => i < llenos);

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="w-20 shrink-0 text-sm font-medium text-foreground">{barra.nombre}</span>
      <div className="flex flex-1 flex-wrap gap-0.5" aria-hidden>
        {dots.map((lleno, i) => (
          <span
            key={i}
            className={cn("h-2.5 w-2.5 rounded-full", lleno ? "bg-primary" : "bg-border")}
          />
        ))}
      </div>
      <span className="shrink-0 text-sm tabular-nums text-muted">
        {formatPorciones(barra.actual)} / {formatPorciones(barra.objetivo)}
      </span>
    </div>
  );
}

export function PortionBars({ barras }: { barras: BarraResumen[] }) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {barras.map((b) => (
        <Barra key={b.id} barra={b} />
      ))}
    </div>
  );
}
