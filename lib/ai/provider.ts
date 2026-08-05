import { logEvent, errorInfo } from "@/lib/log";

export type CausaIaNoDisponible =
  | "sin_llave"
  | "red"
  | "http"
  | "parseo"
  | "timeout"
  | "truncado";

// Lo que se le dice al atleta, por causa. Sin esto el único mensaje posible es
// "no pude estimar", que no distingue entre "tardó demasiado" y "la API está
// caída" — y sin logs del contenedor esa diferencia es imposible de recuperar
// después.
export const MOTIVO_LEGIBLE: Record<CausaIaNoDisponible, string> = {
  sin_llave: "no tengo configurado el modelo",
  red: "no pude conectarme al modelo",
  http: "el modelo respondió con un error",
  parseo: "el modelo respondió algo que no entendí",
  timeout: "el modelo no respondió a tiempo",
  truncado: "se cortó la respuesta del modelo",
};

export class AiUnavailableError extends Error {
  constructor(
    public causa: CausaIaNoDisponible,
    public detalle?: string
  ) {
    super(`IA no disponible (${causa})${detalle ? `: ${detalle}` : ""}`);
    this.name = "AiUnavailableError";
  }
}

export interface AiConfig {
  habilitado: boolean;
  apiKey: string | null;
  modelo: string | null;
  modeloVision: string | null;
  baseUrl: string;
}

// Falla CERRADO si no hay modelo configurado, en vez de adivinar un id: los
// nombres de modelo de xAI cambian, y una app que apunta a un modelo que ya
// no existe falla en tiempo de ejecución con un 404 opaco. Se declaran por
// variable de entorno y se verifican contra /v1/models antes de fijarlos.
export function aiConfig(): AiConfig {
  const apiKey = process.env.XAI_API_KEY?.trim() || null;
  const modelo = process.env.XAI_MODEL?.trim() || null;
  const modeloVision = process.env.XAI_VISION_MODEL?.trim() || modelo;
  return {
    habilitado: Boolean(apiKey && modelo),
    apiKey,
    modelo,
    modeloVision,
    baseUrl: process.env.XAI_BASE_URL?.trim() || "https://api.x.ai/v1",
  };
}

export type ContenidoUsuario =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export interface RespuestaChat {
  contenido: string;
  modelo: string;
  crudo: unknown;
  latenciaMs: number;
}

// Cliente mínimo compatible con la API de chat completions de xAI. Sin SDK:
// es una sola llamada, y una dependencia menos es una dependencia menos que
// romper el layout de node_modules del Dockerfile.
// El contenido de un turno puede ser texto suelto o multimodal. Lo segundo lo
// necesita `/chat` con foto; lo que se PERSISTE como historial es siempre
// texto (ver `lib/ai/chat.ts`), para no meter base64 en Postgres.
export interface MensajeChat {
  role: "user" | "assistant";
  content: string | ContenidoUsuario[];
}

export async function xaiChat(args: {
  modelo: string;
  system: string;
  /** Turno único con contenido multimodal (estimación). */
  user?: ContenidoUsuario[];
  /** Conversación de varios turnos (`/chat`). Excluyente con `user`. */
  mensajes?: MensajeChat[];
  maxTokens?: number;
  timeoutMs?: number;
  temperatura?: number;
  /**
   * La estimación exige JSON estricto; una respuesta conversacional es prosa
   * y con `json_object` activo saldría envuelta en JSON o fallaría. Por
   * defecto va en true para no alterar el camino de estimación.
   */
  formatoJson?: boolean;
}): Promise<RespuestaChat> {
  const cfg = aiConfig();
  if (!cfg.apiKey) throw new AiUnavailableError("sin_llave");

  const inicio = Date.now();
  const controller = new AbortController();
  // grok-4.5 razona antes de responder: medido en 12-17 s con solo texto, y
  // una foto tarda más. Con 25 s se abortaban estimaciones que iban a llegar
  // bien. Es preferible que el atleta espere a que pierda la estimación y el
  // registro caiga a `pendiente` sin necesidad.
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 60_000);

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: args.modelo,
        temperature: args.temperatura ?? 0.2,
        max_tokens: args.maxTokens ?? 1200,
        ...(args.formatoJson === false ? {} : { response_format: { type: "json_object" } }),
        messages: [
          { role: "system", content: args.system },
          ...(args.mensajes ?? [{ role: "user" as const, content: args.user ?? [] }]),
        ],
      }),
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") throw new AiUnavailableError("timeout");
    throw new AiUnavailableError("red", errorInfo(err).msg);
  }
  clearTimeout(timeout);

  const latenciaMs = Date.now() - inicio;

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    logEvent("ia_http_error", { status: res.status, modelo: args.modelo, latenciaMs, cuerpo: cuerpo.slice(0, 400) });
    throw new AiUnavailableError("http", `HTTP ${res.status}`);
  }

  const crudo = await res.json();
  const eleccion = crudo?.choices?.[0];
  const contenido = eleccion?.message?.content;
  const finishReason = eleccion?.finish_reason;

  logEvent("ia_ok", {
    modelo: args.modelo,
    latenciaMs,
    tokens: crudo?.usage?.total_tokens,
    finishReason,
    completionTokens: crudo?.usage?.completion_tokens,
    razonamientoTokens: crudo?.usage?.completion_tokens_details?.reasoning_tokens,
  });

  // `grok-4.5` razona antes de responder y sus tokens de razonamiento cuentan
  // contra el MISMO tope que la respuesta. Cuando se agota, la API devuelve un
  // JSON cortado a la mitad con finish_reason "length". Sin esta comprobación
  // eso llega río abajo disfrazado de error de parseo, que manda a buscar el
  // problema al prompt en vez de al presupuesto de tokens.
  if (finishReason === "length") {
    throw new AiUnavailableError("truncado", `max_tokens=${args.maxTokens ?? 1200}`);
  }
  if (typeof contenido !== "string") throw new AiUnavailableError("parseo", "respuesta sin contenido");

  return { contenido, modelo: args.modelo, crudo, latenciaMs };
}
