export interface DiaSemana {
  fecha: string;
  registrado: boolean;
  kcal: number;
  proteinaG: number;
  adherenciaPct: number | null;
  pesoKg: number | null;
}

export interface RevisionSemanal {
  semanaInicio: string;
  diasRegistrados: number;
  kcalPromedio: number | null;
  proteinaPromedioG: number | null;
  adherenciaPct: number | null;
  pesoPromedioMovil7d: number | null;
  deltaPesoSemana: number | null;
  desviacionDominante: string | null;
  sugerencia: string;
  puedeSugerir: boolean;
}

function promedio(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

// §3.5 + §7.3. Dos reglas que se aplican tal cual:
//
// 1. UNA SOLA desviación dominante, no una lista. Un informe con seis cosas
//    mal es un informe que no se lee.
// 2. Con menos de 4 días registrados NO se sugiere ningún ajuste. Sin datos
//    no hay decisión, y sugerir sobre ruido es peor que no sugerir.
//
// La app sugiere y explica; el atleta aplica. Nunca cambia el objetivo sola.
export function computeWeeklyReview(args: {
  semanaInicio: string;
  dias: DiaSemana[];
  objetivo: { kcal: number; proteinaG: number };
  pesoPrevioMovil7d?: number | null;
}): RevisionSemanal {
  const registrados = args.dias.filter((d) => d.registrado);
  const kcalProm = promedio(registrados.map((d) => d.kcal));
  const protProm = promedio(registrados.map((d) => d.proteinaG));
  const adherencias = registrados
    .map((d) => d.adherenciaPct)
    .filter((x): x is number => x !== null);
  const pesos = args.dias.map((d) => d.pesoKg).filter((x): x is number => x !== null);
  const pesoMovil = promedio(pesos);

  const deltaPeso =
    pesoMovil !== null && args.pesoPrevioMovil7d != null ? pesoMovil - args.pesoPrevioMovil7d : null;

  const puedeSugerir = registrados.length >= 4;

  // Desviación dominante: la mayor separación relativa respecto al objetivo.
  let desviacionDominante: string | null = null;
  if (registrados.length > 0) {
    const candidatas: { etiqueta: string; magnitud: number }[] = [];
    if (args.objetivo.kcal > 0 && kcalProm !== null) {
      const d = (kcalProm - args.objetivo.kcal) / args.objetivo.kcal;
      candidatas.push({
        etiqueta:
          d > 0
            ? `Calorías por encima del objetivo (${Math.round(kcalProm)} vs ${args.objetivo.kcal}).`
            : `Calorías por debajo del objetivo (${Math.round(kcalProm)} vs ${args.objetivo.kcal}).`,
        magnitud: Math.abs(d),
      });
    }
    if (args.objetivo.proteinaG > 0 && protProm !== null) {
      const d = (protProm - args.objetivo.proteinaG) / args.objetivo.proteinaG;
      candidatas.push({
        etiqueta:
          d < 0
            ? `Proteína por debajo del objetivo (${Math.round(protProm)} vs ${args.objetivo.proteinaG} g).`
            : `Proteína por encima del objetivo (${Math.round(protProm)} vs ${args.objetivo.proteinaG} g).`,
        magnitud: Math.abs(d),
      });
    }
    if (registrados.length < 7) {
      candidatas.push({
        etiqueta: `Se registraron ${registrados.length} de 7 días.`,
        magnitud: (7 - registrados.length) / 7,
      });
    }
    candidatas.sort((a, b) => b.magnitud - a.magnitud);
    // Solo se reporta si la desviación es material (>10%).
    desviacionDominante = candidatas[0] && candidatas[0].magnitud > 0.1 ? candidatas[0].etiqueta : null;
  }

  // Tabla del §7.3, siempre sobre el promedio móvil de 7 días, nunca sobre un
  // dato aislado.
  let sugerencia: string;
  if (!puedeSugerir) {
    sugerencia = "Con menos de 4 días registrados no hay base para sugerir un ajuste.";
  } else if (deltaPeso === null) {
    sugerencia = "Falta historial de peso suficiente para sugerir un ajuste.";
  } else if (deltaPeso > -0.4) {
    sugerencia = "La pérdida va lenta. Una opción: bajar 150 kcal de carbohidratos, o subir pasos.";
  } else if (deltaPeso < -0.8) {
    sugerencia = "La pérdida va rápida. Una opción: subir 150 kcal.";
  } else {
    sugerencia = "El ritmo está en rango. No hace falta cambiar nada.";
  }

  return {
    semanaInicio: args.semanaInicio,
    diasRegistrados: registrados.length,
    kcalPromedio: kcalProm,
    proteinaPromedioG: protProm,
    adherenciaPct: promedio(adherencias),
    pesoPromedioMovil7d: pesoMovil,
    deltaPesoSemana: deltaPeso,
    desviacionDominante,
    sugerencia,
    puedeSugerir,
  };
}
