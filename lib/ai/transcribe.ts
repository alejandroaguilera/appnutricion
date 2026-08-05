import { AiUnavailableError } from "./provider";
import { logEvent, errorInfo } from "@/lib/log";

// xAI no transcribe audio y no es una laguna de documentación: verificado
// contra la API en vivo (2026-08-06). `/v1/language-models` declara
// `input_modalities: ["text","image"]` en TODOS sus modelos,
// `/v1/audio/transcriptions` responde 404, y un bloque `input_audio` en el
// content array sale con `400 invalid-argument: Empty content block`. Las
// notas de voz obligan a un segundo proveedor, y por eso vive en su propio
// archivo con su propia llave en vez de colarse dentro de `aiConfig()`.
//
// Por defecto Groq: capa gratuita, ~1 s por nota, API compatible con la de
// OpenAI. Cambiar de proveedor es mover dos variables de entorno, no tocar
// código — la forma multipart es la misma en Groq, OpenAI y cualquier
// pasarela compatible.
export interface TranscripcionConfig {
  habilitado: boolean;
  apiKey: string | null;
  modelo: string;
  baseUrl: string;
}

export function transcripcionConfig(): TranscripcionConfig {
  const apiKey = process.env.GROQ_API_KEY?.trim() || null;
  return {
    habilitado: Boolean(apiKey),
    apiKey,
    modelo: process.env.TRANSCRIPCION_MODELO?.trim() || "whisper-large-v3-turbo",
    baseUrl: process.env.TRANSCRIPCION_BASE_URL?.trim() || "https://api.groq.com/openai/v1",
  };
}

// Tope defensivo. Una nota de voz de Telegram ronda los 20 KB por segundo;
// 20 MB son más de diez minutos, que ya no es un registro de comida.
const MAX_BYTES = 20 * 1024 * 1024;

export async function transcribirAudio(args: {
  buffer: Buffer;
  /** Nombre con extensión real. El decodificador la usa para elegir formato. */
  nombre: string;
  timeoutMs?: number;
}): Promise<{ texto: string; latenciaMs: number }> {
  const cfg = transcripcionConfig();
  if (!cfg.apiKey) throw new AiUnavailableError("sin_llave", "sin GROQ_API_KEY");
  if (args.buffer.byteLength > MAX_BYTES) {
    throw new AiUnavailableError("http", "audio demasiado largo");
  }

  const inicio = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 60_000);

  // `FormData` y `Blob` son globales en Node 20: cero dependencias nuevas,
  // igual que el resto de `lib/ai/`.
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(args.buffer)]), args.nombre);
  form.append("model", cfg.modelo);
  form.append("response_format", "json");
  // El atleta habla español de México. Fijar el idioma evita que una nota
  // corta y ruidosa se transcriba como si fuera inglés.
  form.append("language", "es");
  // Sesga el vocabulario hacia lo que de verdad se dicta aquí. Sin esto,
  // "aoa" o "SMAE" salen como cualquier cosa.
  form.append(
    "prompt",
    "Registro de comida en español de México: porciones, gramos, tortillas, " +
      "aguacate, avena, proteína, SMAE, desayuno, comida, cena, snack, agua, peso."
  );

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: form,
      signal: controller.signal,
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
    logEvent("transcripcion_http_error", {
      status: res.status,
      modelo: cfg.modelo,
      latenciaMs,
      cuerpo: cuerpo.slice(0, 400),
    });
    throw new AiUnavailableError("http", `HTTP ${res.status}`);
  }

  const crudo = await res.json().catch(() => null);
  const texto = typeof crudo?.text === "string" ? crudo.text.trim() : "";

  logEvent("transcripcion_ok", { modelo: cfg.modelo, latenciaMs, caracteres: texto.length });

  // Silencio o ruido: es un fallo de contenido, no de la API. Río arriba se
  // traduce a "no le entendí", que es distinto de "no puedo escucharte".
  if (!texto) throw new AiUnavailableError("parseo", "transcripción vacía");

  return { texto, latenciaMs };
}
