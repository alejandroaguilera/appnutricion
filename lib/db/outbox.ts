import { getDB } from "./indexeddb";
import type { OutboxRecord, OutboxMethod } from "./types";

export function newOutboxRecord(
  method: OutboxMethod,
  url: string,
  body: unknown
): Omit<OutboxRecord, "seq"> {
  return {
    eventId: crypto.randomUUID(),
    method,
    url,
    body,
    timestampCliente: Date.now(),
    intentos: 0,
    nextAttemptAt: Date.now(),
    permanentError: null,
  };
}

export async function listOutbox(): Promise<OutboxRecord[]> {
  const db = await getDB();
  const all = await db.getAll("outbox");
  return all.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

export async function countPendingOutbox(): Promise<number> {
  const all = await listOutbox();
  return all.filter((r) => !r.permanentError).length;
}

export async function removeOutboxRecord(seq: number): Promise<void> {
  const db = await getDB();
  await db.delete("outbox", seq);
}

export async function markOutboxAttempt(
  seq: number,
  patch: Partial<Pick<OutboxRecord, "intentos" | "nextAttemptAt" | "permanentError">>
): Promise<void> {
  const db = await getDB();
  const record = await db.get("outbox", seq);
  if (!record) return;
  await db.put("outbox", { ...record, ...patch });
}
