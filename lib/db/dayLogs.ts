import { getDB } from "./indexeddb";
import { newOutboxRecord } from "./outbox";
import type { DayLogRecord } from "./types";

export function toWire(record: DayLogRecord) {
  return {
    ...record,
    cerradoEn: record.cerradoEn ? record.cerradoEn.toISOString() : null,
  };
}

// Escribe el DayLog local Y encola su evento de sync en una sola transacción
// de IndexedDB — un cambio de entidad nunca existe sin su registro de outbox
// correspondiente. Esta es la garantía real de durabilidad, no la red.
export async function saveDayLog(record: DayLogRecord): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["dayLogs", "outbox"], "readwrite");
  await tx.objectStore("dayLogs").put(record);
  await tx.objectStore("outbox").add(newOutboxRecord("PUT", `/api/days/${record.id}`, toWire(record)));
  await tx.done;
}

export async function getDayLog(id: string): Promise<DayLogRecord | undefined> {
  const db = await getDB();
  return db.get("dayLogs", id);
}

export async function getDayLogByFecha(fecha: string): Promise<DayLogRecord | undefined> {
  const db = await getDB();
  return db.getFromIndex("dayLogs", "by-fecha", fecha);
}

// Crea el DayLog del día si todavía no existe (nace con UUID de cliente al
// primer toque, no al abrir la pantalla — "no existe botón de guardar") y le
// aplica el cambio. Usado por los widgets de agua/peso/nota del bloque
// inferior de Hoy (§3.1), que no pasan por el flujo de registro de comidas.
export async function updateDayLogField(
  fecha: string,
  existing: DayLogRecord | null,
  patch: Partial<Pick<DayLogRecord, "aguaMl" | "pesoCorporalKg" | "notas" | "animo1a5" | "hambre1a5">>
): Promise<DayLogRecord> {
  const base: DayLogRecord =
    existing ?? {
      id: crypto.randomUUID(),
      fecha,
      pesoCorporalKg: null,
      aguaMl: null,
      notas: null,
      animo1a5: null,
      hambre1a5: null,
      cerradoEn: null,
      revision: 1,
    };
  const updated: DayLogRecord = { ...base, ...patch };
  await saveDayLog(updated);
  return updated;
}
