import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { telegramConfig } from "@/lib/telegram/api";
import { procesarUpdate, type TelegramUpdate } from "@/lib/telegram/router";
import { logEvent, errorInfo } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tipoDe(u: TelegramUpdate): "texto" | "foto" | "comando" | "callback" {
  if (u.callback_query) return "callback";
  if (u.message?.photo?.length) return "foto";
  if (u.message?.text?.startsWith("/")) return "comando";
  return "texto";
}

// Único POST público de la app (§6.3). El orden de las comprobaciones importa
// y no debe alterarse.
export async function POST(req: NextRequest) {
  const cfg = telegramConfig();

  // 1 — Secreto del webhook. 401 sin cuerpo ni pistas.
  if (!cfg.secreto || req.headers.get("x-telegram-bot-api-secret-token") !== cfg.secreto) {
    logEvent("tg_webhook_401", {});
    return new NextResponse(null, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  // 2 — Un solo chat autorizado. A cualquier otro se le responde 200 y NO se
  // le contesta nada: confirmarle la existencia del bot a un desconocido no
  // aporta nada (§6.3).
  const chatId = String(update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? "");
  if (!chatId || chatId !== cfg.chatId) {
    logEvent("tg_chat_no_autorizado", { chatId });
    return NextResponse.json({ ok: true });
  }

  // 3 — Deduplicación por update_id ANTES de procesar. Telegram reintenta los
  // webhooks que no responden 200 rápido; sin esto se registran comidas por
  // duplicado (§6.4).
  try {
    const insertado = await prisma.telegramUpdate.createMany({
      data: [
        {
          updateId: BigInt(update.update_id),
          chatId,
          tipo: tipoDe(update),
          payloadCrudo: update as never,
        },
      ],
      skipDuplicates: true,
    });
    if (insertado.count === 0) {
      logEvent("tg_update_duplicado", { updateId: update.update_id });
      return NextResponse.json({ ok: true });
    }
  } catch (err) {
    logEvent("tg_dedupe_error", errorInfo(err));
    return NextResponse.json({ ok: true });
  }

  logEvent("tg_update", { updateId: update.update_id, tipo: tipoDe(update) });

  // 4 — Procesar SIN await y 5 — responder 200 de inmediato. Funciona porque
  // el contenedor corre `node server.js`, un proceso persistente: la promesa
  // sigue viva en el mismo event loop después de enviar la respuesta. Red de
  // seguridad: el barrido de updates con procesadoEn NULL (lib/jobs).
  void procesarUpdate(update)
    .then(async (mealEntryId) => {
      await prisma.telegramUpdate.update({
        where: { updateId: BigInt(update.update_id) },
        data: { procesadoEn: new Date(), mealEntryId: mealEntryId ?? undefined },
      });
    })
    .catch(async (err) => {
      logEvent("tg_proceso_fallido", { updateId: update.update_id, ...errorInfo(err) });
      await prisma.telegramUpdate
        .update({
          where: { updateId: BigInt(update.update_id) },
          data: { intentos: { increment: 1 }, error: errorInfo(err).msg.slice(0, 300) },
        })
        .catch(() => {});
    });

  return NextResponse.json({ ok: true });
}
