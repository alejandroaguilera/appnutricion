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
export function computeAdherencia(
  plan: { targets: { porcionesDia: number; foodGroup: { clave: string } }[] },
  portions: { porciones: number; foodGroup: { clave: string } }[]
): number | null {
  const reales = new Map<string, number>();
  for (const p of portions) {
    reales.set(p.foodGroup.clave, (reales.get(p.foodGroup.clave) ?? 0) + p.porciones);
  }
  return computeAdherencePct(
    plan.targets.map((t) => ({
      clave: t.foodGroup.clave,
      reales: reales.get(t.foodGroup.clave) ?? 0,
      objetivo: t.porcionesDia,
    }))
  );
}
