import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute, jsonError } from "@/lib/http/route";
import { estimatePortions } from "@/lib/ai/estimatePortions";
import { loadDishContext } from "@/lib/ai/dishContext";
import { AiUnavailableError, MOTIVO_LEGIBLE } from "@/lib/ai/provider";
import { logEvent, newErrorId, errorInfo } from "@/lib/log";

// Misma estimación que `POST /api/estimate`, servida como `text/event-stream`.
//
// No es una mejora cosmética. Una estimación con foto tarda 20-60 s y el POST
// normal no entrega un solo byte en todo ese rato: para el proxy, para el
// navegador y para quien mira la pantalla, es indistinguible de una petición
// colgada. Aquí el razonamiento del modelo sale según se produce, así que la
// espera deja de ser silencio y la conexión nunca queda inactiva.
//
// Como en `/api/estimate`, NO escribe nada: la confirmación obligatoria del
// §3.2 sigue siendo del atleta. Lo que sí se escribe antes de llamar aquí es
// el registro `pendiente` que hace el cliente, para que la comida exista
// aunque esta conexión se caiga a la mitad.
//
// Los eventos son:
//   fase   {fase}            — en qué paso va
//   razon  {texto}           — un trozo del razonamiento del modelo
//   listo  {estimacion, …}   — el mismo payload que devuelve /api/estimate
//   sin_ia {causa, motivo}   — equivalente al 503 del endpoint no-streaming
//   falla  {errorId}         — error interno, ya escrito en la bitácora
export const POST = withRoute<unknown>("estimate.stream", async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError(400, "payload_invalido");

  const { texto, fotoId, slotNombre } = body as {
    texto?: string | null;
    fotoId?: string | null;
    slotNombre?: string | null;
  };

  if (!texto?.trim() && !fotoId) return jsonError(422, "sin_entrada");

  // Todo lo que puede fallar con un código HTTP honesto se resuelve ANTES de
  // abrir el stream: una vez enviada la primera cabecera el status ya está
  // fijado en 200 y un fallo solo puede viajar como evento.
  let imagen: { base64: string; mime: string } | null = null;
  if (fotoId) {
    const foto = await prisma.mealPhoto.findUnique({
      where: { id: fotoId },
      select: { datos: true, mime: true },
    });
    if (!foto) return jsonError(404, "foto_no_encontrada");
    imagen = { base64: Buffer.from(foto.datos).toString("base64"), mime: foto.mime };
  }

  const dishes = await loadDishContext();
  const horaLocal = new Date().toLocaleTimeString("es-MX", {
    timeZone: "America/Matamoros",
    hour: "2-digit",
    minute: "2-digit",
  });

  const encoder = new TextEncoder();
  const inicio = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let vivo = true;
      const enviar = (evento: string, dato: unknown) => {
        if (!vivo) return;
        try {
          controller.enqueue(encoder.encode(`event: ${evento}\ndata: ${JSON.stringify(dato)}\n\n`));
        } catch {
          // El atleta cerró la pestaña o se fue la red. No es un error del
          // servidor y no debe tumbar lo que quede por hacer aquí.
          vivo = false;
        }
      };

      // Un comentario SSE de apertura: fuerza el primer flush para que el
      // cliente sepa que conectó sin esperar al modelo.
      try {
        controller.enqueue(encoder.encode(": abierto\n\n"));
      } catch {
        vivo = false;
      }

      try {
        const resultado = await estimatePortions({
          texto,
          imagen,
          slotNombre,
          horaLocal,
          dishes,
          onProgreso: (p) => enviar(p.tipo, p),
        });

        enviar("listo", {
          fuente: resultado.fuente,
          dishId: resultado.dishId,
          modelo: resultado.modelo,
          latenciaMs: resultado.latenciaMs,
          estimacion: resultado.estimacion,
          crudo: resultado.crudo,
        });
        logEvent("estimate_stream_ok", { fuente: resultado.fuente, ms: Date.now() - inicio, conFoto: Boolean(imagen) });
      } catch (err) {
        if (err instanceof AiUnavailableError) {
          logEvent("estimate_stream_sin_ia", { causa: err.causa, ms: Date.now() - inicio });
          enviar("sin_ia", { causa: err.causa, motivo: MOTIVO_LEGIBLE[err.causa] });
        } else {
          const errorId = newErrorId();
          logEvent("estimate_stream_error", { errorId, ms: Date.now() - inicio, ...errorInfo(err) });
          enviar("falla", { errorId });
        }
      } finally {
        if (vivo) {
          try {
            controller.close();
          } catch {
            // Ya cerrado desde el otro extremo.
          }
        }
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // `no-transform` es el que importa: sin él un proxy puede comprimir el
      // cuerpo y bufferizarlo, que es exactamente lo que este endpoint existe
      // para evitar. `X-Accel-Buffering` dice lo mismo en el dialecto de nginx.
      "Cache-Control": "no-cache, no-store, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
});
