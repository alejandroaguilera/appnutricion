import { NextRequest, NextResponse } from "next/server";
import { withRoute, jsonError } from "@/lib/http/route";
import { setWebhook, getWebhookInfo, telegramConfig } from "@/lib/telegram/api";

// Registrar el webhook requiere una llamada saliente a la API de Telegram con
// el token. Sin acceso a shell en el contenedor, esta ruta protegida es la
// única forma de hacerlo.
export const POST = withRoute<unknown>("telegram.setup", async (req: NextRequest) => {
  const secreto = process.env.JOBS_SECRET;
  if (!secreto || req.headers.get("x-jobs-secret") !== secreto) {
    return jsonError(401, "no_autorizado");
  }

  const cfg = telegramConfig();
  if (!cfg.habilitado || !cfg.secreto) {
    return jsonError(503, "telegram_no_configurado", {
      falta: [
        !cfg.token && "TELEGRAM_BOT_TOKEN",
        !cfg.chatId && "TELEGRAM_CHAT_ID",
        !cfg.secreto && "TELEGRAM_WEBHOOK_SECRET",
      ].filter(Boolean),
    });
  }

  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "https://appnutricion.mrhapps.mx";
  const resultado = await setWebhook(`${base}/api/telegram/webhook`, cfg.secreto);
  const info = await getWebhookInfo();

  return NextResponse.json({
    setWebhook: resultado,
    webhookInfo: info.ok ? info.result : { error: info.motivo },
  });
});

export const GET = withRoute<unknown>("telegram.setup.get", async (req: NextRequest) => {
  const secreto = process.env.JOBS_SECRET;
  if (!secreto || req.headers.get("x-jobs-secret") !== secreto) {
    return jsonError(401, "no_autorizado");
  }
  const cfg = telegramConfig();
  const info = await getWebhookInfo();
  return NextResponse.json({
    configurado: cfg.habilitado,
    tieneSecreto: Boolean(cfg.secreto),
    webhookInfo: info.ok ? info.result : { error: info.motivo },
  });
});
