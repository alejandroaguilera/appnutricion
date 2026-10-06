import { cn } from "@/lib/utils";
import type { MacroResumen } from "@/lib/nutrition/summary";

function pct(actual: number, objetivo: number): number {
  if (objetivo <= 0) return 0;
  return (actual / objetivo) * 100;
}

function Barra({ valor, className }: { valor: number; className?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", className)}
        style={{ width: `${Math.min(100, Math.max(0, valor))}%` }}
      />
    </div>
  );
}

function MacroFila({
  etiqueta,
  actual,
  objetivo,
  unidad,
  className,
}: {
  etiqueta: string;
  actual: number;
  objetivo: number;
  unidad: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
        <span className="font-medium text-foreground">{etiqueta}</span>
        <span className="text-muted">
          {Math.round(actual)}
          {objetivo > 0 ? ` / ${Math.round(objetivo)}` : ""} {unidad}
        </span>
      </div>
      <Barra valor={pct(actual, objetivo)} className={className} />
    </div>
  );
}

// Vista de macros del día: kcal + P/C/G contra el objetivo del plan.
// Distinto de las barras de porciones (§3.1): aquí se lee el aporte
// nutricional congelado; abajo se verifica el plan en intercambios SMAE.
// Sin rojo ni ✗ (§7.4): pasar el objetivo solo llena la barra al tope.
export function MacroBars({ macros }: { macros: MacroResumen }) {
  return (
    <div className="flex flex-col gap-3">
      <MacroFila
        etiqueta="kcal"
        actual={macros.kcalActual}
        objetivo={macros.kcalObjetivo}
        unidad="kcal"
        className="bg-primary"
      />
      <div className="grid grid-cols-3 gap-3">
        <MacroFila
          etiqueta="P"
          actual={macros.proteinaActual}
          objetivo={macros.proteinaObjetivo}
          unidad="g"
          className="bg-macro-p"
        />
        <MacroFila
          etiqueta="C"
          actual={macros.carbosActual}
          objetivo={macros.carbosObjetivo}
          unidad="g"
          className="bg-macro-c"
        />
        <MacroFila
          etiqueta="G"
          actual={macros.grasaActual}
          objetivo={macros.grasaObjetivo}
          unidad="g"
          className="bg-macro-g"
        />
      </div>
    </div>
  );
}
