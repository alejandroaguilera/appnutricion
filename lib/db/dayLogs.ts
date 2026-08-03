import { getDB } from "./indexeddb";
import { newOutboxRecord } from "./outbox";
import { toFechaKey } from "./mappers";
import type { DayLogRecord } from "./types";

export function toWire(record: DayLogRecord) {
  return {
    ...record,
    fecha: toFechaKey(record.fecha),
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
  return db.getFromIndex("dayLogs", "by-fecha", toFechaKey(fecha));
}

// ÚNICO punto donde nace un DayLog en el cliente. Busca y crea dentro de la
// MISMA transacción, así que dos toques rápidos no pueden acuñar dos días
// para la misma fecha.
//
// Antes cada camino de registro decidía por su cuenta si crear el día, usando
// un `dayLog` que venía de estado de React posiblemente rancio; cuando el
// índice `by-fecha` quedó envenenado, cada registro creó un día nuevo y todos
// menos el primero chocaron contra la restricción única del servidor.
export async function ensureDayLog(fecha: string): Promise<DayLogRecord> {
  const clave = toFechaKey(fecha);
  const db = await getDB();
  const tx = db.transaction(["dayLogs", "outbox"], "readwrite");
  const store = tx.objectStore("dayLogs");

  const existente = await store.index("by-fecha").get(clave);
  if (existente) {
    await tx.done;
    return existente;
  }

  const record: DayLogRecord = {
    id: crypto.randomUUID(),
    fecha: clave,
    pesoCorporalKg: null,
    aguaMl: null,
    notas: null,
    animo1a5: null,
    hambre1a5: null,
    cerradoEn: null,
    revision: 1,
  };
  await store.put(record);
  await tx.objectStore("outbox").add(newOutboxRecord("PUT", `/api/days/${record.id}`, toWire(record)));
  await tx.done;
  return record;
}

// Aplica un cambio al DayLog del día (agua, peso, nota, ánimo, hambre) —
// widgets del bloque inferior de Hoy (§3.1) que no pasan por el flujo de
// registro de comidas. "No existe botón de guardar".
export async function updateDayLogField(
  fecha: string,
  patch: Partial<Pick<DayLogRecord, "aguaMl" | "pesoCorporalKg" | "notas" | "animo1a5" | "hambre1a5">>
): Promise<DayLogRecord> {
  const base = await ensureDayLog(fecha);
  const updated: DayLogRecord = { ...base, ...patch };
  await saveDayLog(updated);
  return updated;
}
