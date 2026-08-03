import type { MacroResumen } from "@/lib/nutrition/summary";

// §3.1 — tipografía secundaria y más pequeña, a propósito: los macros son
// verificación, no el instrumento principal de la pantalla.
export function MacroSummaryLine({ macros }: { macros: MacroResumen }) {
  return (
    <p className="text-xs text-muted">
      {Math.round(macros.kcalActual).toLocaleString("es-MX")} / {Math.round(macros.kcalObjetivo).toLocaleString("es-MX")} kcal
      {" · "}P {Math.round(macros.proteinaActual)}
      {" · "}C {Math.round(macros.carbosActual)}
      {" · "}G {Math.round(macros.grasaActual)}
    </p>
  );
}
