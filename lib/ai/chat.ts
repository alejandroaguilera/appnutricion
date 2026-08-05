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
import { localDayString } from "@/lib/date";
import { logEvent } from "@/lib/log";

export const MAX_TURNOS = 8;

// Arma el contexto del día con lo que ya existe: sin esto, "¿qué puedo cenar
// hoy?" solo puede contestarse con generalidades de internet. Con esto sabe
// qué le falta y qué suele comer.
export async function construirContexto(fecha = localDayString()): Promise<ContextoChat> {
  const [barras, dia, plan, dishes] = await Promise.all([
    barrasDelDia(fecha),
    prisma.dayLog.findUnique({
      where: { fecha: new Date(`${fecha}T00:00:00.000Z`) },
      include: { meals: { where: { archivadoEn: null }, include: { portions: true } } },
    }),
    prisma.nutritionPlan.findFirst({ where: { activo: true } }),
    loadDishContext(20),
  ]);

  const portions = dia?.meals.flatMap((m) => m.portions) ?? [];

  return {
    fecha,
    barras,
    kcal: portions.reduce((a, p) => a + p.kcal, 0),
    kcalObjetivo: plan?.kcalObjetivo ?? 0,
    proteinaG: portions.reduce((a, p) => a + p.proteinaG, 0),
    proteinaObjetivo: plan?.proteinaG ?? 0,
    nEntradas: dia?.meals.length ?? 0,
    platillos: dishes.map((d) => ({ nombre: d.nombre, alias: d.alias })),
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
    maxTokens: args.imagen ? 1200 : 600,
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
