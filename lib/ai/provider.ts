import { logEvent, errorInfo } from "@/lib/log";

export type CausaIaNoDisponible = "sin_llave" | "red" | "http" | "parseo" | "timeout";

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
export async function xaiChat(args: {
  modelo: string;
  system: string;
  user: ContenidoUsuario[];
  maxTokens?: number;
  timeoutMs?: number;
  temperatura?: number;
}): Promise<RespuestaChat> {
  const cfg = aiConfig();
  if (!cfg.apiKey) throw new AiUnavailableError("sin_llave");

  const inicio = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 25_000);

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
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
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
  const contenido = crudo?.choices?.[0]?.message?.content;
  if (typeof contenido !== "string") throw new AiUnavailableError("parseo", "respuesta sin contenido");

  logEvent("ia_ok", { modelo: args.modelo, latenciaMs, tokens: crudo?.usage?.total_tokens });
  return { contenido, modelo: args.modelo, crudo, latenciaMs };
}
