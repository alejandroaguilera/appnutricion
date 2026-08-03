// Reducción de imagen en el cliente, sin dependencias: `createImageBitmap` +
// canvas están en todos los navegadores que soportan PWA. Evita `sharp`, que
// es binario nativo y obligaría a tocar el layout de node_modules del
// Dockerfile (el runner copia node_modules del stage `deps`).
//
// Una foto de cámara moderna son 3-5 MB; a 1024 px y calidad 0.78 baja a
// ~150-250 KB, que es lo que se guarda en Postgres y lo que se le manda al
// modelo de visión.

export interface ImagenReducida {
  blob: Blob;
  ancho: number;
  alto: number;
}

async function dibujar(file: Blob, maxLado: number): Promise<{ canvas: HTMLCanvasElement; ancho: number; alto: number }> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d no disponible");
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();
  return { canvas, ancho, alto };
}

function aBlob(canvas: HTMLCanvasElement, calidad: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob devolvió null"))),
      "image/jpeg",
      calidad
    );
  });
}

export async function downscaleImage(
  file: Blob,
  { maxLado = 1024, calidad = 0.78, maxBytes = 380 * 1024 } = {}
): Promise<ImagenReducida> {
  const { canvas, ancho, alto } = await dibujar(file, maxLado);
  let blob = await aBlob(canvas, calidad);

  // Si aun así se pasa del tope del endpoint, se baja calidad antes que
  // resolución: el modelo de visión pierde más con menos píxeles que con más
  // compresión.
  let q = calidad;
  while (blob.size > maxBytes && q > 0.4) {
    q -= 0.12;
    blob = await aBlob(canvas, q);
  }

  return { blob, ancho, alto };
}

export async function makeThumbnail(file: Blob, lado = 128): Promise<Blob> {
  const { canvas } = await dibujar(file, lado);
  return aBlob(canvas, 0.7);
}

// Sube la foto ANTES de que exista la comida y de forma independiente: si la
// estimación falla, la foto ya está a salvo y la entrada se puede guardar
// como `pendiente` sin perder la evidencia.
export async function subirFoto(file: Blob): Promise<string | null> {
  try {
    const { blob, ancho, alto } = await downscaleImage(file);
    const id = crypto.randomUUID();
    const res = await fetch(`/api/photos/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "image/jpeg",
        "x-ancho": String(ancho),
        "x-alto": String(alto),
      },
      body: blob,
    });
    return res.ok ? id : null;
  } catch {
    return null;
  }
}
