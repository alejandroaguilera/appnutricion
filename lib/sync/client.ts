import { countPendingOutbox } from "@/lib/db/outbox";

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

export async function getPendingCount(): Promise<number> {
  return countPendingOutbox();
}
