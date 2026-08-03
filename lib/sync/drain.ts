import { listOutbox, removeOutboxRecord, markOutboxAttempt } from "@/lib/db/outbox";
import { notifySyncStatusChanged } from "./client";

let draining = false;

function backoffMs(intentos: number): number {
  const base = Math.min(30_000 * 2 ** intentos, 5 * 60_000);
  const jitter = base * (0.8 + Math.random() * 0.4);
  return jitter;
}

// Drena el outbox estrictamente en orden `seq`. Ante un fallo transitorio
// (offline / 5xx) detiene todo el pase en vez de saltarse el ítem — así se
// garantiza que un PUT de DayLog siempre llegue antes que los PUT de sus
// MealEntry, ya que se encolaron en ese orden, sin necesitar un grafo de
// dependencias aparte. Un 4xx permanente se salta (no se descarta en
// silencio) para que no atore la cola para siempre.
export async function drainOutbox(): Promise<void> {
  if (draining) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  draining = true;
  try {
    const records = await listOutbox();
    const now = Date.now();
    for (const record of records) {
      if (record.seq === undefined) continue;
      if (record.permanentError) continue;
      if (record.nextAttemptAt > now) break;

      try {
        const res = await fetch(record.url, {
          method: record.method,
          headers: record.body ? { "Content-Type": "application/json" } : undefined,
          body: record.body ? JSON.stringify(record.body) : undefined,
        });

        if (res.ok) {
          await removeOutboxRecord(record.seq);
          continue;
        }

        if (res.status >= 400 && res.status < 500) {
          await markOutboxAttempt(record.seq, {
            permanentError: `HTTP ${res.status}`,
          });
          continue; // no atorar la cola por un bug real; seguir procesando
        }

        // 5xx: transitorio, detener el pase y reintentar después con backoff.
        await markOutboxAttempt(record.seq, {
          intentos: record.intentos + 1,
          nextAttemptAt: Date.now() + backoffMs(record.intentos + 1),
        });
        break;
      } catch {
        // Fallo de red: transitorio, detener el pase.
        await markOutboxAttempt(record.seq, {
          intentos: record.intentos + 1,
          nextAttemptAt: Date.now() + backoffMs(record.intentos + 1),
        });
        break;
      }
    }
  } finally {
    draining = false;
    notifySyncStatusChanged();
  }
}
