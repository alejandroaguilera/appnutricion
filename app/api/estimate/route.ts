import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute, jsonError } from "@/lib/http/route";
import { estimatePortions } from "@/lib/ai/estimatePortions";
import { loadDishContext } from "@/lib/ai/dishContext";
import { AiUnavailableError, MOTIVO_LEGIBLE } from "@/lib/ai/provider";

// POST { texto?, fotoId?, slotNombre? } → estimación para confirmar.
//
// NO escribe nada: la confirmación obligatoria del §3.2 significa que ninguna
// estimación se guarda sin que el atleta la vea. Este endpoint solo propone.
export const POST = withRoute<unknown>("estimate.post", async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError(400, "payload_invalido");

  const { texto, fotoId, slotNombre } = body as {
    texto?: string | null;
    fotoId?: string | null;
    slotNombre?: string | null;
  };

  if (!texto?.trim() && !fotoId) return jsonError(422, "sin_entrada");

  let imagen: { base64: string; mime: string } | null = null;
  if (fotoId) {
    const foto = await prisma.mealPhoto.findUnique({
      where: { id: fotoId },
      select: { datos: true, mime: true },
    });
    if (!foto) return jsonError(404, "foto_no_encontrada");
    imagen = { base64: Buffer.from(foto.datos).toString("base64"), mime: foto.mime };
  }

  try {
    const resultado = await estimatePortions({
      texto,
      imagen,
      slotNombre,
      horaLocal: new Date().toLocaleTimeString("es-MX", {
        timeZone: "America/Matamoros",
        hour: "2-digit",
        minute: "2-digit",
      }),
      dishes: await loadDishContext(),
    });

    return NextResponse.json({
      fuente: resultado.fuente,
      dishId: resultado.dishId,
      modelo: resultado.modelo,
      latenciaMs: resultado.latenciaMs,
      estimacion: resultado.estimacion,
      crudo: resultado.crudo,
    });
  } catch (err) {
    // 503 y no 500: el cliente tiene que distinguir "la IA no está disponible"
    // (guarda como pendiente y reintenta luego) de "esta petición está mal"
    // (no la reintentes nunca).
    if (err instanceof AiUnavailableError) {
      // `motivo` va resuelto desde aquí y no en el cliente: MOTIVO_LEGIBLE vive
      // junto a `aiConfig`, que lee process.env, y no tiene por qué acabar en
      // el bundle del navegador.
      return jsonError(503, "ia_no_disponible", { causa: err.causa, motivo: MOTIVO_LEGIBLE[err.causa] });
    }
    throw err;
  }
});
