import type { IDBPTransaction, IDBPDatabase, StoreNames } from "idb";
import { toFechaKey } from "./mappers";
import type { AppNutricionDB } from "./indexeddb";
import type { OutboxRecord } from "./types";

export interface RepairReport {
  fechasNormalizadas: number;
  diasDuplicados: number;
  comidasRepuntadas: number;
  outboxReescrito: number;
}

// Se usa tanto desde la transacción de versión (migración v2) como desde una
// readwrite normal (reconciliación), así que el modo queda abierto.
type AnyTx = IDBPTransaction<
  AppNutricionDB,
  StoreNames<AppNutricionDB>[],
  "versionchange" | "readwrite"
>;

// Repunta todo lo que colgaba de un DayLog perdedor hacia el superviviente:
// las comidas locales y, crucialmente, los registros del outbox que aún no se
// han entregado (su URL lleva el id del día dentro). Se comparte con la
// reconciliación, que hace exactamente lo mismo cuando el servidor revela que
// el id canónico de un día es otro.
export async function repointDayLog(
  tx: AnyTx,
  deId: string,
  aId: string
): Promise<{ comidas: number; outbox: number }> {
  let comidas = 0;
  let outbox = 0;

  const meals = tx.objectStore("mealEntries");
  const porDia = await meals.index("by-dayLogId").getAll(deId);
  for (const meal of porDia) {
    await meals.put({ ...meal, dayLogId: aId });
    comidas++;
  }

  const outboxStore = tx.objectStore("outbox");
  const pendientes = await outboxStore.getAll();
  for (const rec of pendientes) {
    if (rec.seq === undefined) continue;
    if (!rec.url.includes(`/api/days/${deId}`)) continue;
    const body = rec.body as Record<string, unknown> | null;
    const nuevo: OutboxRecord = {
      ...rec,
      url: rec.url.replace(`/api/days/${deId}`, `/api/days/${aId}`),
      body:
        body && typeof body === "object"
          ? { ...body, ...(body.dayLogId !== undefined ? { dayLogId: aId } : {}) }
          : body,
    };
    await outboxStore.put(nuevo);
    outbox++;
  }

  return { comidas, outbox };
}

// Migración v1 → v2. Sana el daño del bug de `fecha`:
//
//   1. `fecha` guardada como ISO completo → clave "YYYY-MM-DD".
//   2. Varios DayLog para la MISMA fecha (cada registro fallido acuñaba uno
//      nuevo) → se elige uno y los demás se pliegan a él.
//   3. Los registros del outbox atorados apuntan a ids que ya no existen →
//      se reescriben para que apunten al superviviente y puedan entregarse.
//
// Conservador a propósito: nunca borra un día cuyas comidas tengan escrituras
// pendientes sin repuntarlas primero. Corre dentro de la transacción de
// versión, así que o se aplica entera o no se aplica.
export async function repairV2(tx: AnyTx): Promise<RepairReport> {
  const reporte: RepairReport = {
    fechasNormalizadas: 0,
    diasDuplicados: 0,
    comidasRepuntadas: 0,
    outboxReescrito: 0,
  };

  const dayLogs = tx.objectStore("dayLogs");

  // 1 — normalizar `fecha` en cada fila.
  const todos = await dayLogs.getAll();
  for (const dia of todos) {
    const clave = toFechaKey(dia.fecha);
    if (clave !== dia.fecha) {
      await dayLogs.put({ ...dia, fecha: clave });
      reporte.fechasNormalizadas++;
    }
  }

  // 2 — agrupar por fecha ya normalizada.
  const normalizados = await dayLogs.getAll();
  const porFecha = new Map<string, typeof normalizados>();
  for (const dia of normalizados) {
    if (!dia.fecha) continue;
    const lista = porFecha.get(dia.fecha) ?? [];
    lista.push(dia);
    porFecha.set(dia.fecha, lista);
  }

  const meals = tx.objectStore("mealEntries");

  for (const [, dias] of porFecha) {
    if (dias.length < 2) continue;

    // Superviviente = el que más comidas tiene colgando; desempate por id
    // menor para que el resultado sea determinista.
    const conteos = new Map<string, number>();
    for (const dia of dias) {
      const n = (await meals.index("by-dayLogId").getAllKeys(dia.id)).length;
      conteos.set(dia.id, n);
    }
    const superviviente = [...dias].sort((a, b) => {
      const d = (conteos.get(b.id) ?? 0) - (conteos.get(a.id) ?? 0);
      return d !== 0 ? d : a.id.localeCompare(b.id);
    })[0];

    for (const perdedor of dias) {
      if (perdedor.id === superviviente.id) continue;
      const movido = await repointDayLog(tx, perdedor.id, superviviente.id);
      reporte.comidasRepuntadas += movido.comidas;
      reporte.outboxReescrito += movido.outbox;
      await dayLogs.delete(perdedor.id);
      reporte.diasDuplicados++;
    }
  }

  // 3 — rellenar los campos nuevos del outbox para que el drenado no lea
  // `undefined` en registros encolados antes de esta versión.
  const outboxStore = tx.objectStore("outbox");
  const pendientes = await outboxStore.getAll();
  for (const rec of pendientes) {
    if (rec.seq === undefined) continue;
    if (rec.ultimoIntentoEn !== undefined) continue;
    await outboxStore.put({
      ...rec,
      ultimoIntentoEn: null,
      httpStatus: null,
      ultimoError: null,
    });
  }

  return reporte;
}

// Escotilla de escape para Ajustes: si la reparación automática se equivocara,
// el servidor es autoritativo y una reconciliación reconstruye todo. Se
// preserva el outbox — ahí vive lo único que el servidor todavía no sabe.
export async function resetLocalData(db: IDBPDatabase<AppNutricionDB>): Promise<void> {
  const stores: StoreNames<AppNutricionDB>[] = [
    "foodGroups",
    "catalog",
    "dishes",
    "plan",
    "dayLogs",
    "mealEntries",
    "mealEntryPortions",
    "syncState",
  ];
  const tx = db.transaction(stores, "readwrite");
  await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
  await tx.done;
}
