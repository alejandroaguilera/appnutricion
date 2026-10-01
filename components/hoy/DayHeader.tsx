import type { MacroResumen } from "@/lib/nutrition/summary";
import { MacroBars } from "@/components/hoy/MacroBars";

// Cabecera del día: fecha + vista de macros (kcal · P · C · G) contra el
// objetivo. Responde de un vistazo "cómo voy hoy". Sin ✗ rojos ni caritas:
// un día fuera de objetivo es un dato neutro (§7.4).
export function DayHeader({
  fecha,
  macros,
  nEntradas,
}: {
  fecha: string;
  macros: MacroResumen;
  nEntradas: number;
}) {
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

      <MacroBars macros={macros} />
    </header>
  );
}
