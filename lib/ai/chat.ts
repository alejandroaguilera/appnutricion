import { prisma } from "@/lib/prisma";
import {
  aiConfig,
  xaiChat,
  AiUnavailableError,
  type MensajeChat,
  type ContenidoUsuario,
} from "./provider";
import { SYSTEM_CHAT, contextoComoTexto, type ContextoChat } from "./promptChat";
import { loadDishContext } from "./dishContext";
import { barrasDelDia } from "@/lib/telegram/registro";
import { FOOD_GROUPS, bucketNombreForClave, computePortionMacros } from "@/lib/nutrition/groups";
import { localDayString } from "@/lib/date";
import { logEvent } from "@/lib/log";

export const MAX_TURNOS = 8;

// El plan vigente tiene 17 platillos activos: con el corte anterior de 20 (y de
// 15 al imprimirlos) se quedaban recetas fuera sin que nada lo dijera.
const LIMITE_PLATILLOS = 40;

// Arma el contexto del día con lo que ya existe: sin esto, "¿qué puedo cenar
// hoy?" solo puede contestarse con generalidades de internet, y "¿cuál es la
// receta de X?" con una receta de internet en vez de la suya.
export async function construirContexto(fecha = localDayString()): Promise<ContextoChat> {
  const [barras, dia, plan, dishes] = await Promise.all([
    barrasDelDia(fecha),
    prisma.dayLog.findUnique({
      where: { fecha: new Date(`${fecha}T00:00:00.000Z`) },
      include: {
        meals: {
          where: { archivadoEn: null },
          orderBy: { horaRegistro: "asc" },
          include: { portions: true, slot: { select: { nombre: true } } },
        },
      },
    }),
    prisma.nutritionPlan.findFirst({
      where: { activo: true },
      include: {
        slots: {
          orderBy: { orden: "asc" },
          include: { targets: { include: { foodGroup: { select: { clave: true } } } } },
        },
      },
    }),
    loadDishContext(LIMITE_PLATILLOS),
  ]);

  const meals = dia?.meals ?? [];
  const portions = meals.flatMap((m) => m.portions);

  return {
    fecha,
    barras,
    kcal: portions.reduce((a, p) => a + p.kcal, 0),
    kcalObjetivo: plan?.kcalObjetivo ?? 0,
    proteinaG: portions.reduce((a, p) => a + p.proteinaG, 0),
    proteinaObjetivo: plan?.proteinaG ?? 0,
    carbosObjetivo: plan?.carbosG ?? 0,
    grasaObjetivo: plan?.grasaG ?? 0,
    fibraObjetivo: plan?.fibraG ?? 0,
    aguaObjetivoL: plan?.aguaL ?? 0,
    planNombre: plan?.nombre ?? null,
    nEntradas: meals.length,

    tiempos: (plan?.slots ?? []).map((s) => ({
      nombre: s.nombre,
      hora: s.horaSugerida,
      esOpcional: s.esOpcional,
      // Los targets se siembran contra un subgrupo representativo (proteína
      // contra aoa_muy_bajo, grasa contra grasa_sin_proteina), así que se
      // etiquetan con el nombre de la barra que ve el atleta y no con el
      // nombre técnico del FoodGroup — es el mismo rollup del §7.2.
      targets: s.targets
        .filter((t) => t.porciones > 0)
        .map((t) => ({ nombre: bucketNombreForClave(t.foodGroup.clave), porciones: t.porciones })),
    })),

    comidasDeHoy: meals.map((m) => ({
      tiempo: m.slot?.nombre ?? m.clave,
      titulo: m.titulo ?? m.textoLibre ?? "sin nombre",
      kcal: m.portions.reduce((a, p) => a + p.kcal, 0),
      proteinaG: m.portions.reduce((a, p) => a + p.proteinaG, 0),
      pendiente: m.estadoClasificacion === "pendiente",
    })),

    platillos: dishes.map((d) => {
      const macros = d.components.reduce(
        (acc, c) => {
          const tasa = FOOD_GROUPS.find((g) => g.clave === c.foodGroupClave);
          if (!tasa) return acc;
          const m = computePortionMacros(tasa, c.porciones);
          return { kcal: acc.kcal + m.kcal, proteinaG: acc.proteinaG + m.proteinaG };
        },
        { kcal: 0, proteinaG: 0 }
      );

      return {
        nombre: d.nombre,
        alias: d.alias,
        tipoComida: d.tipoComida,
        componentes: d.components.map((c) => ({
          nombre: c.foodItemNombre ?? c.foodGroupClave,
          // Los gramos del menú mandan sobre la medida casera del catálogo:
          // "138 g cocida" es más accionable que "1/3 taza".
          cantidad: c.notaLibre ?? c.cantidadPorcion,
          grupo: c.foodGroupClave,
          porciones: c.porciones,
        })),
        ...macros,
      };
    }),
  };
}

export interface RespuestaChatIa {
  texto: string;
  historial: MensajeChat[];
  latenciaMs: number;
}

export async function responderPregunta(args: {
  pregunta: string;
  historial?: MensajeChat[];
  contexto?: ContextoChat;
  /** Foto sobre la que se pregunta ("¿esto tiene cafeína?"). */
  imagen?: { base64: string; mime: string } | null;
}): Promise<RespuestaChatIa> {
  const cfg = aiConfig();
  if (!cfg.habilitado) throw new AiUnavailableError("sin_llave");

  const contexto = args.contexto ?? (await construirContexto());
  const previos = (args.historial ?? []).slice(-(MAX_TURNOS * 2));

  const turno: ContenidoUsuario[] | string = args.imagen
    ? [
        { type: "text", text: args.pregunta },
        {
          type: "image_url",
          image_url: { url: `data:${args.imagen.mime};base64,${args.imagen.base64}`, detail: "high" },
        },
      ]
    : args.pregunta;

  const mensajes: MensajeChat[] = [...previos, { role: "user", content: turno }];

  const res = await xaiChat({
    modelo: (args.imagen ? cfg.modeloVision : cfg.modelo) as string,
    // El contexto del día va en el system para que no se diluya turno a turno
    // ni ocupe lugar en la ventana de historial.
    system: `${SYSTEM_CHAT}\n\n--- Estado actual ---\n${contextoComoTexto(contexto)}`,
    mensajes,
    formatoJson: false, // prosa, no JSON
    temperatura: 0.6,
    // Mirar una foto se lleva tokens de razonamiento que salen del mismo tope
    // que la respuesta; con 600 la contestación sobre una imagen se corta.
    // Se subieron los dos al meterle el plan y las recetas al contexto: hay más
    // material sobre el que razonar y las respuestas citan cantidades. Un tope
    // corto sale como `truncado` → 503 → "no pude contestar", que es el modo de
    // fallo más caro de diagnosticar sin logs del contenedor.
    maxTokens: args.imagen ? 2000 : 1200,
  });

  const texto = res.contenido.trim();
  logEvent("ia_chat", { latenciaMs: res.latenciaMs, turnos: mensajes.length, conFoto: Boolean(args.imagen) });

  // El historial que se persiste guarda SOLO texto. Una foto son ~500 KB de
  // base64 y el historial vive en la columna Json de `TelegramSession`: a la
  // tercera repregunta la fila pesaría megabytes y cada turno reenviaría la
  // imagen al modelo. El marcador deja constancia de que hubo una foto.
  const historialTexto: MensajeChat[] = [
    ...previos,
    { role: "user", content: args.imagen ? `[foto] ${args.pregunta}` : args.pregunta },
    { role: "assistant", content: texto },
  ];

  return {
    texto,
    historial: historialTexto.slice(-(MAX_TURNOS * 2)),
    latenciaMs: res.latenciaMs,
  };
}
