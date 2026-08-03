import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRoute, jsonError } from "@/lib/http/route";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 400 * 1024;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Las fotos viven en Postgres: la app en Dokploy no tiene volumen persistente,
// así que un archivo en disco se pierde en cada redespliegue. Llegan ya
// reducidas desde el cliente (~1024 px), de ahí el tope de 400 KB.
export const PUT = withRoute<Ctx>("photos.put", async (req: NextRequest, { params }) => {
  const { id } = await params;
  const mime = req.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
  if (!MIMES.has(mime)) return jsonError(415, "mime_no_soportado");

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.byteLength === 0) return jsonError(422, "foto_vacia");
  if (buf.byteLength > MAX_BYTES) return jsonError(413, "foto_muy_grande");

  const ancho = Number(req.headers.get("x-ancho")) || null;
  const alto = Number(req.headers.get("x-alto")) || null;

  const foto = await prisma.mealPhoto.upsert({
    where: { id },
    create: { id, mime, bytes: buf.byteLength, datos: buf, ancho, alto },
    update: { mime, bytes: buf.byteLength, datos: buf, ancho, alto },
    select: { id: true, bytes: true },
  });

  return NextResponse.json({ foto });
});

export const GET = withRoute<Ctx>("photos.get", async (req: NextRequest, { params }) => {
  const { id } = await params;
  const mini = req.nextUrl.searchParams.get("mini") === "1";

  const foto = await prisma.mealPhoto.findUnique({
    where: { id },
    select: { datos: true, miniatura: true, mime: true },
  });
  if (!foto) return jsonError(404, "no_encontrada");

  const datos = mini && foto.miniatura ? foto.miniatura : foto.datos;

  return new NextResponse(new Uint8Array(datos), {
    headers: {
      "Content-Type": foto.mime,
      "Content-Length": String(datos.byteLength),
      // El id es un UUID que nunca se reutiliza: la imagen es inmutable.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
