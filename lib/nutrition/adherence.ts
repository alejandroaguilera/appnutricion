import { DISPLAY_GROUPS } from "./groups";

// §7.2 — cálculo en vivo únicamente este ciclo (no se persiste; DayLog.adherenciaPct
// queda null hasta que la fase 6/7 lo calcule y lo guarde).
//
// adherencia_dia = 100 − (Σ |reales − objetivo| por grupo / Σ objetivo) × 100
//
// Verduras excluidas (son libres, sin techo que penalizar).
export function computeAdherencePct(
  porGrupo: { clave: string; reales: number; objetivo: number }[]
): number | null {
  const relevantes = porGrupo.filter((g) => g.clave !== "verdura" && g.objetivo > 0);
  if (relevantes.length === 0) return null;

  const sumaObjetivo = relevantes.reduce((acc, g) => acc + g.objetivo, 0);
  if (sumaObjetivo === 0) return null;

  const sumaDesvio = relevantes.reduce((acc, g) => acc + Math.abs(g.reales - g.objetivo), 0);
  return Math.max(0, 100 - (sumaDesvio / sumaObjetivo) * 100);
}

// Envoltura para el lado servidor: arma el desglose por grupo a partir del
// plan y de las porciones congeladas del día, y aplica la fórmula de arriba.
//
// El rollup a las 5 barras del §3.1 (DISPLAY_GROUPS) no es cosmético, es parte
// de la fórmula. El target agregado de proteína se siembra completo contra
// `aoa_muy_bajo` y el de grasa contra `grasa_sin_proteina` (ver
// REPRESENTATIVE_CLAVE), así que comparar clave contra clave castigaba comer
// justo lo que el plan indica: un desayuno de huevo y panela es `aoa_bajo`, no
// cuenta contra el target de `aoa_muy_bajo`, y el día perfecto leía ~60% de
// adherencia. Un intercambio equivalente no es una desviación (§7.4).
// `computeBarras` (lib/nutrition/summary.ts) ya sumaba así lo que se muestra.
export function computeAdherencia(
  plan: { targets: { porcionesDia: number; foodGroup: { clave: string } }[] },
  portions: { porciones: number; foodGroup: { clave: string } }[]
): number | null {
  const bucketDe = (clave: string): string =>
    DISPLAY_GROUPS.find((b) => (b.claves as string[]).includes(clave))?.id ?? clave;

  const reales = new Map<string, number>();
  for (const p of portions) {
    const bucket = bucketDe(p.foodGroup.clave);
    reales.set(bucket, (reales.get(bucket) ?? 0) + p.porciones);
  }

  const objetivos = new Map<string, number>();
  for (const t of plan.targets) {
    const bucket = bucketDe(t.foodGroup.clave);
    objetivos.set(bucket, (objetivos.get(bucket) ?? 0) + t.porcionesDia);
  }

  return computeAdherencePct(
    [...objetivos].map(([clave, objetivo]) => ({
      clave,
      reales: reales.get(clave) ?? 0,
      objetivo,
    }))
  );
}
