import { cn } from "@/lib/utils";
import type { MacroResumen } from "@/lib/nutrition/summary";

function Barra({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", className)}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

// Cabecera del día al estilo de las capturas: consumido contra objetivo, en
// grande, con barras de kcal y proteína. Sin ✗ rojos ni caritas: un día fuera
// de objetivo es un dato neutro (§7.4).
export function DayHeader({
  fecha,
  macros,
  nEntradas,
}: {
  fecha: string;
  macros: MacroResumen;
  nEntradas: number;
}) {
  const kcalPct = macros.kcalObjetivo > 0 ? (macros.kcalActual / macros.kcalObjetivo) * 100 : 0;
  const protPct = macros.proteinaObjetivo > 0 ? (macros.proteinaActual / macros.proteinaObjetivo) * 100 : 0;
  const fechaLarga = new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold capitalize text-foreground">{fechaLarga}</h1>
          <p className="text-xs text-muted">
            {nEntradas} {nEntradas === 1 ? "registro" : "registros"}
          </p>
        </div>
        <p className="shrink-0 text-right tabular-nums">
          <span className="text-2xl font-semibold text-primary">{Math.round(macros.kcalActual)}</span>
          <span className="text-sm text-muted"> / {Math.round(macros.kcalObjetivo)} kcal</span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Barra pct={kcalPct} className="bg-primary" />
        <div className="flex justify-between text-[11px] tabular-nums text-muted">
          <span>{Math.round(macros.proteinaActual)} g proteína</span>
          <span>objetivo {Math.round(macros.proteinaObjetivo)} g</span>
        </div>
        <Barra pct={protPct} className="bg-foreground/70" />
      </div>
    </header>
  );
}
