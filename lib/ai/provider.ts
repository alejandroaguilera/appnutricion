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

// Trozo de respuesta mientras el modelo sigue escribiendo. `grok-4.5` emite
// primero `reasoning_content` (su razonamiento) y solo después el JSON, así
// que los dos campos llegan por separado y casi nunca a la vez.
export interface DeltaChat {
  razonamiento?: string;
  contenido?: string;
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
  /**
   * Si viene, la respuesta se pide en streaming y cada trozo se entrega según
   * llega. Dos razones, y la segunda importa más que la primera:
   *
   * 1. Se puede enseñar el razonamiento mientras ocurre, en vez de dejar al
   *    atleta 20-60 s frente a un botón que no dice nada.
   * 2. El tiempo de espera deja de ser silencio. Un `fetch` que no entrega un
   *    byte en medio minuto es indistinguible de uno colgado — para el proxy,
   *    para el navegador y para quien mira la pantalla.
   */
  onDelta?: (delta: DeltaChat) => void;
}): Promise<RespuestaChat> {
  const cfg = aiConfig();
  if (!cfg.apiKey) throw new AiUnavailableError("sin_llave");

  const inicio = Date.now();
  const controller = new AbortController();
  // grok-4.5 razona antes de responder: medido en 12-17 s con solo texto, y
  // una foto tarda más. Con 25 s se abortaban estimaciones que iban a llegar
  // bien. Es preferible que el atleta espere a que pierda la estimación y el
  // registro caiga a `pendiente` sin necesidad.
  //
  // En streaming el plazo es de INACTIVIDAD, no total: se rearma con cada
  // trozo. Un modelo que sigue escribiendo no se aborta por llevar rato
  // escribiendo — lo que se quiere cortar es el silencio, no el trabajo.
  const plazo = args.timeoutMs ?? 60_000;
  let timeout = setTimeout(() => controller.abort(), plazo);
  const rearmar = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => controller.abort(), plazo);
  };

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
        ...(args.onDelta ? { stream: true, stream_options: { include_usage: true } } : {}),
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
  // En streaming el plazo sigue armado: lo que falta por vigilar es el silencio
  // ENTRE trozos, que es justo lo que empieza ahora.
  if (!args.onDelta) clearTimeout(timeout);

  if (!res.ok) {
    clearTimeout(timeout);
    const cuerpo = await res.text().catch(() => "");
    logEvent("ia_http_error", {
      status: res.status,
      modelo: args.modelo,
      latenciaMs: Date.now() - inicio,
      cuerpo: cuerpo.slice(0, 400),
    });
    throw new AiUnavailableError("http", `HTTP ${res.status}`);
  }

  let crudo: unknown;
  let contenido: unknown;
  let finishReason: string | undefined;

  if (args.onDelta) {
    try {
      const leido = await leerStream(res, args.onDelta, rearmar);
      crudo = leido.crudo;
      contenido = leido.contenido;
      finishReason = leido.finishReason;
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof AiUnavailableError) throw err;
      if (err instanceof Error && err.name === "AbortError") throw new AiUnavailableError("timeout");
      throw new AiUnavailableError("red", errorInfo(err).msg);
    }
  } else {
    crudo = await res.json();
    const eleccion = (crudo as Chat)?.choices?.[0];
    contenido = eleccion?.message?.content;
    finishReason = eleccion?.finish_reason;
  }
  clearTimeout(timeout);

  const latenciaMs = Date.now() - inicio;
  const uso = (crudo as Chat)?.usage;
  logEvent("ia_ok", {
    modelo: args.modelo,
    latenciaMs,
    streaming: Boolean(args.onDelta),
    tokens: uso?.total_tokens,
    finishReason,
    completionTokens: uso?.completion_tokens,
    razonamientoTokens: uso?.completion_tokens_details?.reasoning_tokens,
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

// Forma mínima de la respuesta de chat completions que este módulo lee. No
// pretende describir la API entera: solo lo que se consulta.
interface Chat {
  choices?: Array<{
    message?: { content?: unknown };
    delta?: { content?: unknown; reasoning_content?: unknown };
    finish_reason?: string;
  }>;
  usage?: {
    total_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

// Lee un cuerpo `text/event-stream` de chat completions y reconstruye la
// respuesta completa mientras entrega cada trozo.
//
// El troceado de la red no respeta las fronteras del protocolo: un `data:`
// puede llegar partido en dos lecturas. Por eso se acumula en `resto` y solo
// se procesan los bloques terminados en línea en blanco.
async function leerStream(
  res: Response,
  onDelta: (d: DeltaChat) => void,
  rearmar: () => void
): Promise<{ contenido: string; finishReason?: string; crudo: unknown }> {
  if (!res.body) throw new AiUnavailableError("red", "respuesta sin cuerpo");

  const lector = res.body.getReader();
  const decoder = new TextDecoder();
  let resto = "";
  let contenido = "";
  let razonamiento = "";
  let finishReason: string | undefined;
  let uso: Chat["usage"];

  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    rearmar();

    resto += decoder.decode(value, { stream: true });
    const bloques = resto.split("\n\n");
    resto = bloques.pop() ?? "";

    for (const bloque of bloques) {
      for (const linea of bloque.split("\n")) {
        if (!linea.startsWith("data:")) continue;
        const dato = linea.slice(5).trim();
        if (!dato || dato === "[DONE]") continue;

        let trozo: Chat;
        try {
          trozo = JSON.parse(dato) as Chat;
        } catch {
          // Un trozo ilegible no tira la estimación entera: el resto del
          // stream sigue siendo utilizable y el JSON final se valida aparte.
          continue;
        }

        if (trozo.usage) uso = trozo.usage;
        const eleccion = trozo.choices?.[0];
        if (!eleccion) continue;
        if (eleccion.finish_reason) finishReason = eleccion.finish_reason;

        const dc = eleccion.delta?.content;
        if (typeof dc === "string" && dc) {
          contenido += dc;
          onDelta({ contenido: dc });
        }
        const dr = eleccion.delta?.reasoning_content;
        if (typeof dr === "string" && dr) {
          razonamiento += dr;
          onDelta({ razonamiento: dr });
        }
      }
    }
  }

  return {
    contenido,
    finishReason,
    // Se devuelve con la misma forma que la respuesta no-streaming para que
    // `crudo` siga siendo comparable entre los dos caminos en la bitácora.
    crudo: {
      choices: [{ message: { content: contenido, reasoning_content: razonamiento }, finish_reason: finishReason }],
      usage: uso,
      streaming: true,
    },
  };
}
