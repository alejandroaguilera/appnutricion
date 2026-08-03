import { getDB } from "@/lib/db/indexeddb";
import { repointDayLog } from "@/lib/db/repair";
import { toDayLogRecord, toMealEntryRecord, toPortionRecord, toFechaKey } from "@/lib/db/mappers";
import { listOutbox } from "@/lib/db/outbox";
import { notifySyncStatusChanged } from "./client";

export interface ReconcileResult {
  fecha: string;
  revision: number;
  agregadas: number;
  actualizadas: number;
  podadas: number;
  idDiaAdoptado: string | null;
  estado: "ok" | "sin_cambios" | "sin_red";
}

const FRESCURA_MS = 5_000;

// Reconciliación multi-escritor (§5.4). El servidor es autoritativo para el
// CONJUNTO de entradas de un día; el cliente nunca manda "el día completo",
// solo entradas individuales por UUID, y aquí las fusiona de vuelta.
//
// Reemplaza a hydrateDay, que esparcía el objeto del servidor sobre las filas
// locales y así corrompió el índice `by-fecha` — de ahí salió la pérdida de
// registros. Ahora todo lo que entra pasa por los mappers.
export async function reconcileDay(
  fecha: string,
  opts: { force?: boolean } = {}
): Promise<ReconcileResult> {
  const clave = toFechaKey(fecha);
  const base: ReconcileResult = {
    fecha: clave,
    revision: 0,
    agregadas: 0,
    actualizadas: 0,
    podadas: 0,
    idDiaAdoptado: null,
    estado: "sin_cambios",
  };

  const db = await getDB();
  const estadoPrevio = await db.get("syncState", `day:${clave}`);
  const revisionVista = estadoPrevio?.revision ?? 0;

  if (!opts.force && estadoPrevio && Date.now() - estadoPrevio.ultimaSyncEn < FRESCURA_MS) {
    return { ...base, revision: revisionVista };
  }

  let data: {
    fecha: string | null;
    revision: number;
    sinCambios?: boolean;
    dayLog?: Record<string, unknown> | null;
    meals?: Record<string, unknown>[];
  };
  try {
    const res = await fetch(`/api/days/${clave}?desde_revision=${revisionVista}`);
    if (!res.ok) return { ...base, estado: "sin_red" };
    data = await res.json();
  } catch {
    return { ...base, estado: "sin_red" }; // sin red: IndexedDB sigue sirviendo
  }

  if (data.sinCambios) {
    await db.put("syncState", { revision: data.revision, ultimaSyncEn: Date.now() }, `day:${clave}`);
    return { ...base, revision: data.revision };
  }

  if (!data.dayLog) {
    await db.put("syncState", { revision: 0, ultimaSyncEn: Date.now() }, `day:${clave}`);
    return { ...base, estado: "ok" };
  }

  // Las comidas con escritura pendiente son intocables: lo local todavía no
  // le ha llegado al servidor, así que su ausencia en la respuesta no
  // significa "borrada", significa "aún no la conozco".
  const pendientes = new Set(
    (await listOutbox())
      .map((r) => r.url.match(/\/meals\/([^/?]+)/)?.[1])
      .filter((x): x is string => Boolean(x))
  );

  const servidor = toDayLogRecord(data.dayLog);
  const meals = data.meals ?? [];

  const tx = db.transaction(
    ["dayLogs", "mealEntries", "mealEntryPortions", "outbox", "syncState"],
    "readwrite"
  );
  const diasStore = tx.objectStore("dayLogs");
  const mealsStore = tx.objectStore("mealEntries");
  const portionsStore = tx.objectStore("mealEntryPortions");

  // 1 — adoptar el id canónico del día si el local es otro (§5.4: el servidor
  // manda). Reusa la misma primitiva que la reparación v2.
  const local = await diasStore.index("by-fecha").get(clave);
  if (local && local.id !== servidor.id) {
    await repointDayLog(tx, local.id, servidor.id);
    await diasStore.delete(local.id);
    base.idDiaAdoptado = servidor.id;
  }
  await diasStore.put(servidor);

  // 2 — fusionar entrada por entrada, por UUID.
  const vistas = new Set<string>();
  for (const crudo of meals) {
    const entrada = toMealEntryRecord(crudo);
    vistas.add(entrada.id);

    if (entrada.archivadoEn) {
      if (!pendientes.has(entrada.id)) {
        await mealsStore.delete(entrada.id);
        for (const k of await portionsStore.index("by-mealEntryId").getAllKeys(entrada.id)) {
          await portionsStore.delete(k);
        }
        base.podadas++;
      }
      continue;
    }

    const existente = await mealsStore.get(entrada.id);

    // Conflicto real: gana `actualizadoEn` más reciente (§5.4.5). Si la
    // versión local es la más nueva se conserva y su PUT ya está encolado.
    if (existente && existente.actualizadoEn.getTime() > entrada.actualizadoEn.getTime()) {
      continue;
    }

    await mealsStore.put(entrada);
    if (existente) base.actualizadas++;
    else base.agregadas++;

    for (const k of await portionsStore.index("by-mealEntryId").getAllKeys(entrada.id)) {
      await portionsStore.delete(k);
    }
    for (const p of (crudo.portions as Record<string, unknown>[] | undefined) ?? []) {
      await portionsStore.put(toPortionRecord(p, entrada.id));
    }
  }

  // 3 — podar fantasmas: comidas locales de este día que el servidor no
  // mencionó y que no tienen escritura pendiente. Son residuo de la época en
  // que la cola estaba atorada.
  for (const local of await mealsStore.index("by-dayLogId").getAll(servidor.id)) {
    if (vistas.has(local.id) || pendientes.has(local.id)) continue;
    await mealsStore.delete(local.id);
    for (const k of await portionsStore.index("by-mealEntryId").getAllKeys(local.id)) {
      await portionsStore.delete(k);
    }
    base.podadas++;
  }

  await tx
    .objectStore("syncState")
    .put({ revision: data.revision, ultimaSyncEn: Date.now() }, `day:${clave}`);
  await tx.done;

  if (base.idDiaAdoptado) notifySyncStatusChanged();

  return { ...base, revision: data.revision, estado: "ok" };
}

export async function reconcileDays(fechas: string[]): Promise<void> {
  for (const f of fechas) {
    await reconcileDay(f, { force: true });
  }
}
