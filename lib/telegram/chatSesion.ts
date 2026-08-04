import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { MensajeChat } from "@/lib/ai/provider";

const VIGENCIA_MIN = 30;

// `TelegramSession.chatId` es la clave primaria, así que hay UNA fila por
// chat. Guardar aquí la conversación destruiría una estimación pendiente de
// confirmar (y al revés): el atleta manda una foto, empieza a preguntar algo
// mientras piensa, y al volver la propuesta ya no existe.
//
// Se resuelve sin migración ni uniones discriminadas: la conversación vive
// bajo la clave `${chatId}:chat`. Es una columna String, admite el sufijo, y
// las dos sesiones conviven con su propio TTL. `manejarCallback` sigue
// leyendo solo `chatId` y nunca ve las de chat.
function clave(chatId: string): string {
  return `${chatId}:chat`;
}

interface EstadoChat {
  mensajes: MensajeChat[];
}

export async function leerHistorial(chatId: string): Promise<MensajeChat[]> {
  const s = await prisma.telegramSession.findUnique({ where: { chatId: clave(chatId) } });
  if (!s) return [];
  if (s.expiraEn < new Date()) {
    await prisma.telegramSession.delete({ where: { chatId: clave(chatId) } }).catch(() => {});
    return [];
  }
  return (s.estado as unknown as EstadoChat)?.mensajes ?? [];
}

export async function guardarHistorial(chatId: string, mensajes: MensajeChat[]): Promise<void> {
  const estado = { mensajes } as unknown as Prisma.InputJsonValue;
  const expiraEn = new Date(Date.now() + VIGENCIA_MIN * 60_000);
  await prisma.telegramSession.upsert({
    where: { chatId: clave(chatId) },
    create: { chatId: clave(chatId), estado, expiraEn },
    update: { estado, expiraEn },
  });
}

export async function olvidarHistorial(chatId: string): Promise<void> {
  await prisma.telegramSession.delete({ where: { chatId: clave(chatId) } }).catch(() => {});
}
