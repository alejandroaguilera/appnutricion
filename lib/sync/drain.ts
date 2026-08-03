import {
  listOutbox,
  removeOutboxRecord,
  markOutboxAttempt,
  resetOutboxRecord,
  listOutboxErrors,
} from "@/lib/db/outbox";
import { getDB } from "@/lib/db/indexeddb";
import { notifySyncStatusChanged } from "./client";

let draining = false;
let limpiezaPorBuildHecha = false;

function backoffMs(intentos: number): number {
  const base = Math.min(30_000 * 2 ** intentos, 5 * 60_000);
  return base * (0.8 + Math.random() * 0.4);
}

// 5xx y estos 4xx son transitorios de verdad; el resto de los 4xx significan
// "esta petición está mal y lo seguirá estando", y reintentarlos es puro ruido.
function esTransitorio(status: number): boolean {
  return status >= 500 || status === 408 || status === 425 || status === 429;
}

async function textoDeError(res: Response): Promise<string> {
  try {
    const cuerpo = await res.json();
    if (cuerpo && typeof cuerpo === "object" && "codigo" in cuerpo) {
      return String((cuerpo as { codigo: unknown }).codigo);
    }
  } catch {
    /* cuerpo no-JSON */
  }
  return `HTTP ${res.status}`;
}

// Tras un despliegue nuevo, la causa más probable de un error "permanente" es
// un bug del servidor que acaba de arreglarse. Se les da una oportunidad más,
// una sola vez por build — si no, un registro marcado durante un bug queda
// enterrado para siempre aunque el bug ya no exista.
async function reintentarPermanentesTrasDespliegue(): Promise<void> {
  if (limpiezaPorBuildHecha) return;
  limpiezaPorBuildHecha = true;

  const build = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
  const db = await getDB();
  const previo = await db.get("syncState", "buildReintento");
  if (previo?.build === build) return;

  for (const rec of await listOutbox()) {
    if (rec.seq !== undefined && rec.permanentError) await resetOutboxRecord(rec.seq);
  }
  await db.put("syncState", { build, revision: 0, ultimaSyncEn: Date.now() }, "buildReintento");
}

export interface DrainResult {
  entregados: number;
  fallidos: number;
  fechasAfectadas: string[];
}

// Drena el outbox en orden `seq`. NO se detiene ante un fallo: antes hacía
// `break` en cualquier 5xx para preservar el orden DayLog → MealEntry, pero
// eso convertía un solo registro roto en una cola congelada para siempre.
// Ahora el orden ya no importa, porque el PUT de una comida crea su día padre
// por clave natural si hace falta — así que cada registro se resuelve solo y
// un vecino atorado no arrastra a los demás.
export async function drainOutbox(): Promise<DrainResult> {
  const vacio: DrainResult = { entregados: 0, fallidos: 0, fechasAfectadas: [] };
  if (draining) return vacio;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return vacio;

  draining = true;
  const resultado: DrainResult = { entregados: 0, fallidos: 0, fechasAfectadas: [] };

  try {
    await reintentarPermanentesTrasDespliegue();

    const records = await listOutbox();
    const now = Date.now();

    for (const record of records) {
      if (record.seq === undefined) continue;
      if (record.permanentError) continue;
      if (record.nextAttemptAt > now) continue;

      const fecha =
        record.body && typeof record.body === "object"
          ? ((record.body as { fecha?: string }).fecha ?? null)
          : null;

      try {
        const res = await fetch(record.url, {
          method: record.method,
          headers: record.body ? { "Content-Type": "application/json" } : undefined,
          body: record.body ? JSON.stringify(record.body) : undefined,
        });

        if (res.ok) {
          await removeOutboxRecord(record.seq);
          resultado.entregados++;
          if (fecha && !resultado.fechasAfectadas.includes(fecha)) resultado.fechasAfectadas.push(fecha);
          continue;
        }

        const detalle = await textoDeError(res);

        if (esTransitorio(res.status)) {
          await markOutboxAttempt(record.seq, {
            intentos: record.intentos + 1,
            nextAttemptAt: Date.now() + backoffMs(record.intentos + 1),
            ultimoIntentoEn: Date.now(),
            httpStatus: res.status,
            ultimoError: detalle,
          });
          resultado.fallidos++;
          continue;
        }

        // 4xx real: el registro está mal y no va a mejorar solo. Se marca,
        // pero el error queda visible y con botón de reintento — antes se
        // saltaba en silencio y el dato se perdía sin que nadie se enterara.
        await markOutboxAttempt(record.seq, {
          permanentError: detalle,
          ultimoIntentoEn: Date.now(),
          httpStatus: res.status,
          ultimoError: detalle,
        });
        resultado.fallidos++;
      } catch (err) {
        await markOutboxAttempt(record.seq, {
          intentos: record.intentos + 1,
          nextAttemptAt: Date.now() + backoffMs(record.intentos + 1),
          ultimoIntentoEn: Date.now(),
          httpStatus: null,
          ultimoError: err instanceof Error ? err.message : "sin red",
        });
        resultado.fallidos++;
      }
    }
  } finally {
    draining = false;
    notifySyncStatusChanged();
  }

  return resultado;
}

export async function retryOutboxRecord(seq: number): Promise<void> {
  await resetOutboxRecord(seq);
  await drainOutbox();
}

export async function retryAllPermanent(): Promise<void> {
  for (const rec of await listOutboxErrors()) {
    if (rec.seq !== undefined) await resetOutboxRecord(rec.seq);
  }
  await drainOutbox();
}

export async function discardOutboxRecord(seq: number): Promise<void> {
  await removeOutboxRecord(seq);
  notifySyncStatusChanged();
}
