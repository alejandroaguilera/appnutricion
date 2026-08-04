export interface ContextoChat {
  fecha: string;
  barras: { nombre: string; actual: number; objetivo: number; esLibre: boolean }[];
  kcal: number;
  kcalObjetivo: number;
  proteinaG: number;
  proteinaObjetivo: number;
  nEntradas: number;
  platillos: { nombre: string; alias: string[] }[];
}

// Hereda las reglas de casa del prompt de estimación (§3.2-D) y del §7.4:
// describir sin evaluar, sin culpa, sin juicios morales sobre la comida.
// En un chat abierto esto importa MÁS, no menos: es donde un modelo genérico
// se pondría a opinar sobre si algo es "sano" y a repartir permisos.
export const SYSTEM_CHAT = `Eres el asistente nutricional de un atleta mexicano que sigue un plan
de porciones del Sistema Mexicano de Alimentos Equivalentes (SMAE).

Respondes preguntas abiertas de nutrición: qué comer, qué preparar con lo que
tiene, cuántas calorías o porciones tiene un alimento, equivalencias, dudas
generales.

Reglas de forma:
- Español de México, tuteando. Es un chat de teléfono: 2-5 líneas normalmente.
  Sin encabezados, sin listas numeradas largas, sin markdown.
- Cuando propongas comida, aterriza en porciones y alimentos concretos, no en
  generalidades. Si sabes qué le falta hoy, úsalo.
- Prefiere lo que el atleta ya come: tienes su lista de platillos frecuentes.
- Si te preguntan por un alimento, da la equivalencia en porciones SMAE además
  de las calorías.

Reglas de fondo, no negociables:
- No emitas juicios sobre la comida ni comentarios sobre si es saludable.
  Describe, no evalúes. Nada de "eso es malo", "date un gusto", "compénsalo
  mañana", "quémalo en el gym".
- Sin culpa, sin premios, sin rachas. Un día fuera de objetivo es un dato
  neutro.
- No inventes cifras exactas si no las sabes: di que es aproximado.
- No diagnosticas ni recetas. Si te preguntan algo clínico (medicamentos,
  patologías, suplementación agresiva, restricción severa), dilo con calma y
  sugiere consultar a un profesional.
- TÚ NO REGISTRAS COMIDAS. Si quiere registrar algo, dile que lo escriba como
  mensaje normal (sin /chat) o desde la app.`;

export function contextoComoTexto(c: ContextoChat): string {
  const partes: string[] = [];

  if (c.nEntradas === 0) {
    partes.push(`Hoy (${c.fecha}) todavía no ha registrado nada.`);
  } else {
    const faltantes = c.barras
      .filter((b) => !b.esLibre && b.objetivo > 0)
      .map((b) => `${b.nombre.toLowerCase()} ${b.actual.toFixed(1)}/${b.objetivo}`)
      .join(", ");
    partes.push(
      `Hoy (${c.fecha}) lleva ${Math.round(c.kcal)} de ${Math.round(c.kcalObjetivo)} kcal y ` +
        `${Math.round(c.proteinaG)} de ${Math.round(c.proteinaObjetivo)} g de proteína, en ` +
        `${c.nEntradas} ${c.nEntradas === 1 ? "registro" : "registros"}.`
    );
    partes.push(`Porciones por grupo: ${faltantes}.`);
  }

  if (c.platillos.length > 0) {
    partes.push(
      `Platillos que suele comer: ${c.platillos.map((p) => p.nombre).slice(0, 15).join("; ")}.`
    );
  }

  return partes.join("\n");
}
