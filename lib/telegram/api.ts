import { logEvent, errorInfo } from "@/lib/log";

export interface TelegramConfig {
  habilitado: boolean;
  token: string | null;
  chatId: string | null;
  secreto: string | null;
}

export function telegramConfig(): TelegramConfig {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim() || null;
  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;
  return { habilitado: Boolean(token && chatId), token, chatId, secreto };
}

export interface InlineButton {
  text: string;
  callback_data: string;
}

type Fallo = { ok: false; motivo: string };
type Exito<T> = { ok: true; result: T };

// Toda llamada degrada a no-op cuando falta el token, en vez de lanzar: la
// app tiene que compilar y correr en verde sin ninguna credencial puesta.
async function llamar<T>(metodo: string, payload: unknown): Promise<Exito<T> | Fallo> {
  const { token } = telegramConfig();
  if (!token) return { ok: false, motivo: "sin_token" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) {
      logEvent("tg_api_error", { metodo, descripcion: data.description });
      return { ok: false, motivo: String(data.description ?? res.status) };
    }
    return { ok: true, result: data.result as T };
  } catch (err) {
    logEvent("tg_api_excepcion", { metodo, ...errorInfo(err) });
    return { ok: false, motivo: "red" };
  }
}

export function sendMessage(
  chatId: string,
  text: string,
  botones?: InlineButton[][]
) {
  return llamar<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(botones ? { reply_markup: { inline_keyboard: botones } } : {}),
  });
}

export function editMessageText(
  chatId: string,
  messageId: number,
  text: string,
  botones?: InlineButton[][]
) {
  return llamar("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...(botones ? { reply_markup: { inline_keyboard: botones } } : {}),
  });
}

export function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return llamar("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

export function setWebhook(url: string, secretToken: string) {
  return llamar("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
}

export function getWebhookInfo() {
  return llamar<Record<string, unknown>>("getWebhookInfo", {});
}

// Descarga una foto de Telegram. Se elige la variante más grande que quepa en
// el tope: Telegram ya generó la escalera de tamaños, así que no hace falta
// redimensionar del lado del servidor (ni, por tanto, `sharp`).
export async function descargarFoto(
  photos: { file_id: string; file_size?: number; width: number; height: number }[],
  maxBytes = 380 * 1024
): Promise<{ buffer: Buffer; fileId: string; ancho: number; alto: number } | null> {
  const { token } = telegramConfig();
  if (!token || photos.length === 0) return null;

  const ordenadas = [...photos].sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0));
  const elegida = ordenadas.find((p) => (p.file_size ?? 0) <= maxBytes) ?? ordenadas[ordenadas.length - 1];

  const info = await llamar<{ file_path: string }>("getFile", { file_id: elegida.file_id });
  if (!info.ok) return null;

  try {
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, fileId: elegida.file_id, ancho: elegida.width, alto: elegida.height };
  } catch (err) {
    logEvent("tg_descarga_error", errorInfo(err));
    return null;
  }
}
