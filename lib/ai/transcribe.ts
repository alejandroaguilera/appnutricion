import { aiConfig, AiUnavailableError } from "./provider";
import { logEvent, errorInfo } from "@/lib/log";

// Transcripción de notas de voz con xAI. Usa la MISMA `XAI_API_KEY` que el
// resto de la app: no hace falta ninguna credencial nueva.
//
// Ojo con cómo se busca este endpoint: `/v1/audio/transcriptions` (la ruta
// compatible con OpenAI) responde **404** en xAI, y el modelo de chat rechaza
// un bloque `input_audio` con `400 Empty content block`. Nada de eso significa
// que xAI no transcriba: la ruta es `/v1/stt` y tiene su propia forma, que no
// es la de OpenAI (sin campo `model`, y la respuesta trae `text`, `language`,
// `duration` y `words`). Verificado de punta a punta el 2026-08-06.
//
// https://docs.x.ai/developers/model-capabilities/audio/speech-to-text
export interface TranscripcionConfig {
  habilitado: boolean;
  apiKey: string | null;
  baseUrl: string;
}

export function transcripcionConfig(): TranscripcionConfig {
  // `aiConfig().habilitado` exige además XAI_MODEL, que aquí no se usa: /v1/stt
  // no recibe nombre de modelo. Basta con la llave.
  const { apiKey, baseUrl } = aiConfig();
  return { habilitado: Boolean(apiKey), apiKey, baseUrl };
}

// Sesga la transcripción hacia el vocabulario que de verdad se dicta aquí.
// El endpoint admite el campo repetido (máx. 100 términos de 50 caracteres).
const TERMINOS = [
  "SMAE",
  "porciones",
  "tortillas",
  "aguacate",
  "avena",
  "proteína",
  "desayuno",
  "comida",
  "cena",
  "snack",
  "post gym",
  "deshacer",
];

// Tope defensivo muy por debajo de los 500 MB que admite la API: una nota de
// voz de Telegram ronda los 20 KB por segundo, así que 20 MB ya son más de
// diez minutos y eso no es un registro de comida.
const MAX_BYTES = 20 * 1024 * 1024;

export async function transcribirAudio(args: {
  buffer: Buffer;
  /** Nombre con extensión real; el contenedor se autodetecta igual. */
  nombre: string;
  timeoutMs?: number;
}): Promise<{ texto: string; latenciaMs: number; segundos: number | null }> {
  const cfg = transcripcionConfig();
  if (!cfg.apiKey) throw new AiUnavailableError("sin_llave", "sin XAI_API_KEY");
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
  form.append("language", "es");
  // Normalización inversa de texto: es lo que convierte "quinientos" en "500"
  // y "ochenta y cuatro punto tres" en "84.3". Sin esto, `/agua` y `/peso`
  // dictados no traerían ningún número que registrar.
  form.append("format", "true");
  for (const termino of TERMINOS) form.append("keyterm", termino);

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/stt`, {
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
      latenciaMs,
      cuerpo: cuerpo.slice(0, 400),
    });
    throw new AiUnavailableError("http", `HTTP ${res.status}`);
  }

  const crudo = await res.json().catch(() => null);
  const texto = typeof crudo?.text === "string" ? crudo.text.trim() : "";
  const segundos = typeof crudo?.duration === "number" ? crudo.duration : null;

  logEvent("transcripcion_ok", { latenciaMs, segundos, caracteres: texto.length });

  // Silencio o ruido: la API devuelve 200 con `text` vacío. Es un fallo de
  // contenido, no de la API, y río arriba se traduce a "no le entendí" — que
  // es muy distinto de "no puedo escucharte".
  if (!texto) throw new AiUnavailableError("parseo", "transcripción vacía");

  return { texto, latenciaMs, segundos };
}
