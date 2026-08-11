import { FOOD_GROUPS } from "@/lib/nutrition/groups";

export interface ComponenteChat {
  nombre: string;
  /** Cantidad legible: gramos del menú si se conocen, si no la medida casera. */
  cantidad: string | null;
  grupo: string;
  porciones: number;
}

export interface PlatilloChat {
  nombre: string;
  alias: string[];
  tipoComida: string[];
  componentes: ComponenteChat[];
  kcal: number;
  proteinaG: number;
}

export interface TiempoChat {
  nombre: string;
  hora: string;
  esOpcional: boolean;
  targets: { nombre: string; porciones: number }[];
}

export interface ComidaDeHoy {
  tiempo: string;
  titulo: string;
  kcal: number;
  proteinaG: number;
  pendiente: boolean;
}

export interface ContextoChat {
  fecha: string;
  barras: { nombre: string; actual: number; objetivo: number; esLibre: boolean }[];
  kcal: number;
  kcalObjetivo: number;
  proteinaG: number;
  proteinaObjetivo: number;
  carbosObjetivo: number;
  grasaObjetivo: number;
  fibraObjetivo: number;
  aguaObjetivoL: number;
  planNombre: string | null;
  nEntradas: number;
  tiempos: TiempoChat[];
  comidasDeHoy: ComidaDeHoy[];
  platillos: PlatilloChat[];
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

Abajo tienes su plan completo, sus tiempos de comida, lo que lleva registrado
hoy y las recetas guardadas con sus cantidades reales.

Reglas de forma:
- Español de México, tuteando. Es un chat de teléfono: 2-5 líneas normalmente.
  Sin encabezados, sin listas numeradas largas, sin markdown.
- Cuando propongas comida, aterriza en porciones y alimentos concretos, no en
  generalidades. Usa lo que le falta hoy y el target del tiempo que viene.
- Prefiere lo que el atleta ya come: tienes sus recetas guardadas.

Reglas de fondo, no negociables:
- Si te preguntan por una receta o un platillo QUE ESTÁ en las recetas
  guardadas, contesta con SUS cantidades, las de abajo — no con una versión
  genérica ni con las cantidades típicas de ese platillo. Son las que le dio su
  nutrióloga y son las que tiene que seguir.
- Si te preguntan por un platillo que NO está en la lista, dilo primero ("ese no
  lo tienes guardado") y después propón una versión que cuadre con su plan.
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

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Las mismas tasas con las que la app calcula y congela los macros (§7.1). Sin
// esto el bot da equivalencias de su preentrenamiento que no coinciden con las
// que el atleta ve en pantalla.
function tasasSmae(): string {
  return FOOD_GROUPS.filter((g) => g.clave !== "libre")
    .map((g) => `- ${g.clave}: ${g.kcal} kcal · ${g.proteinaG} P · ${g.carbosG} C · ${g.grasaG} G`)
    .join("\n");
}

function bloquePlan(c: ContextoChat): string {
  const lineas = [
    `Plan: ${c.planNombre ?? "sin nombre"}.`,
    `Objetivo diario: ${Math.round(c.kcalObjetivo)} kcal · ${Math.round(c.proteinaObjetivo)} g proteína · ` +
      `${Math.round(c.carbosObjetivo)} g carbohidratos · ${Math.round(c.grasaObjetivo)} g grasa · ` +
      `${Math.round(c.fibraObjetivo)} g fibra · ${c.aguaObjetivoL} L de agua.`,
  ];

  if (c.tiempos.length > 0) {
    lineas.push("Tiempos de comida y porciones que le tocan a cada uno:");
    for (const t of c.tiempos) {
      const targets = t.targets.map((g) => `${g.nombre.toLowerCase()} ${num(g.porciones)}`).join(", ");
      lineas.push(
        `- ${t.nombre} (${t.hora}${t.esOpcional ? ", opcional" : ""}): ${targets || "sin target definido"}`
      );
    }
  }

  return lineas.join("\n");
}

function bloqueHoy(c: ContextoChat): string {
  const lineas: string[] = [];

  if (c.nEntradas === 0) {
    // Antes aquí se emitía "todavía no ha registrado nada" y se omitían los
    // objetivos por completo — justo en el momento en que se pregunta "¿qué
    // desayuno?", que es cuando más falta hacen.
    lineas.push(`Hoy (${c.fecha}) todavía no ha registrado nada: lleva 0 de ${Math.round(c.kcalObjetivo)} kcal.`);
  } else {
    lineas.push(
      `Hoy (${c.fecha}) lleva ${Math.round(c.kcal)} de ${Math.round(c.kcalObjetivo)} kcal y ` +
        `${Math.round(c.proteinaG)} de ${Math.round(c.proteinaObjetivo)} g de proteína, en ` +
        `${c.nEntradas} ${c.nEntradas === 1 ? "registro" : "registros"}.`
    );
    lineas.push(
      "Comidas de hoy: " +
        c.comidasDeHoy
          .map(
            (m) =>
              `${m.tiempo} — ${m.titulo} (${Math.round(m.kcal)} kcal)${m.pendiente ? " [sin clasificar]" : ""}`
          )
          .join("; ")
    );
  }

  const barras = c.barras
    .filter((b) => b.objetivo > 0)
    .map(
      (b) =>
        `${b.nombre.toLowerCase()} ${num(b.actual)}/${num(b.objetivo)}${b.esLibre ? " (piso, no techo)" : ""}`
    )
    .join(", ");
  if (barras) lineas.push(`Porciones por grupo: ${barras}.`);

  return lineas.join("\n");
}

function bloqueRecetas(c: ContextoChat): string {
  return c.platillos
    .map((p) => {
      const encabezado =
        `${p.nombre}${p.tipoComida.length ? ` (${p.tipoComida.join("/")})` : ""}` +
        `${p.alias.length ? ` [también: ${p.alias.join(", ")}]` : ""}` +
        ` — ${Math.round(p.kcal)} kcal · ${Math.round(p.proteinaG)} g proteína`;
      const componentes = p.componentes
        .map(
          (comp) =>
            `  · ${comp.nombre}${comp.cantidad ? ` — ${comp.cantidad}` : ""} = ` +
            `${num(comp.porciones)} ${comp.grupo}`
        )
        .join("\n");
      return `${encabezado}\n${componentes}`;
    })
    .join("\n\n");
}

export function contextoComoTexto(c: ContextoChat): string {
  const partes = [
    `--- Plan vigente ---\n${bloquePlan(c)}`,
    `--- Hoy ---\n${bloqueHoy(c)}`,
  ];

  if (c.platillos.length > 0) {
    partes.push(
      `--- Recetas guardadas (cantidades reales de su plan) ---\n${bloqueRecetas(c)}`
    );
  }

  partes.push(`--- Tasas del SMAE por porción ---\n${tasasSmae()}`);

  return partes.join("\n\n");
}
