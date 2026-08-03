import { listOutbox } from "@/lib/db/outbox";
import type { OutboxRecord } from "@/lib/db/types";

type Listener = () => void;
const listeners = new Set<Listener>();

// Pub-sub mínimo para que el indicador de sync se re-renderice cuando cambia
// el outbox, sin traer una librería de data-fetching.
export function subscribeSyncStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifySyncStatusChanged(): void {
  for (const l of listeners) l();
}

export interface SyncStatus {
  pendientes: number;
  conError: number;
  ultimoError: string | null;
}

// Un registro cuenta como "con error" si ya se rindió (4xx permanente) o si
// lleva 3 intentos fallidos: a esa altura ya no es una desconexión pasajera y
// el atleta merece verlo, no un contador que nunca baja.
function conProblema(r: OutboxRecord): boolean {
  return Boolean(r.permanentError) || r.intentos >= 3;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const todos = await listOutbox();
  const problematicos = todos.filter(conProblema);
  return {
    pendientes: todos.filter((r) => !r.permanentError).length,
    conError: problematicos.length,
    ultimoError: problematicos[0]?.ultimoError ?? problematicos[0]?.permanentError ?? null,
  };
}

export async function getSyncErrors(): Promise<OutboxRecord[]> {
  return (await listOutbox()).filter(conProblema);
}

export async function getPendingCount(): Promise<number> {
  return (await getSyncStatus()).pendientes;
}
