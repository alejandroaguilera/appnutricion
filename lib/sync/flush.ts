import { drainOutbox, type DrainResult } from "./drain";
import { listOutbox } from "@/lib/db/outbox";

let listenersRegistered = false;

export type MotivoFlush = "inicio" | "visible" | "oculto" | "pagehide" | "online" | "poll";

type AlDrenar = (r: DrainResult) => void;
let alDrenar: AlDrenar | null = null;

// Permite que AppInit reconcilie los días que acaban de sincronizar, sin que
// este módulo dependa de la capa de reconciliación.
export function onDrained(cb: AlDrenar | null): void {
  alDrenar = cb;
}

// Registra los disparadores de flush requeridos por §4/§5.4: visibilitychange
// y pagehide, NO solo beforeunload (poco confiable en móvil). beforeunload
// se agrega igual como ayuda extra best-effort, nunca como única garantía.
export function initSyncListeners(): void {
  if (listenersRegistered || typeof window === "undefined") return;
  listenersRegistered = true;

  document.addEventListener("visibilitychange", () => {
    void triggerFlush(document.visibilityState === "visible" ? "visible" : "oculto");
  });
  window.addEventListener("pagehide", () => void triggerFlush("pagehide"));
  window.addEventListener("online", () => void triggerFlush("online"));
  window.addEventListener("beforeunload", () => void triggerFlush("pagehide"));

  // Poll periódico ligero mientras la pestaña está visible y online; nunca es
  // el mecanismo de corrección — la escritura en IndexedDB ya ocurrió antes.
  setInterval(() => {
    if (document.visibilityState === "visible" && navigator.onLine) void triggerFlush("poll");
  }, 15_000);

  void triggerFlush("inicio");
}

export async function triggerFlush(motivo: MotivoFlush = "poll"): Promise<DrainResult> {
  const resultado = await drainOutbox();

  // El beacon SOLO al desmontar. Antes se disparaba en cada trigger —
  // incluido el poll de 15 s — reenviando registros que estaban en backoff y
  // saltándose su propio `nextAttemptAt`, además de que lo entregado por
  // beacon nunca se desencola.
  if (motivo === "pagehide" || motivo === "oculto") {
    await sendBeaconFallback();
  }

  if (resultado.entregados > 0 && alDrenar) alDrenar(resultado);
  return resultado;
}

// sendBeacon es el único mecanismo que el navegador garantiza intentar
// durante el desmontaje en pagehide/unload, ya que un fetch() en curso puede
// abortarse a mitad de camino. No reemplaza drainOutbox — es una entrega
// paralela best-effort de lo que siga pendiente al momento del desmontaje.
async function sendBeaconFallback(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) return;
  const ahora = Date.now();
  const pending = (await listOutbox()).filter((r) => !r.permanentError && r.nextAttemptAt <= ahora);
  if (pending.length === 0) return;
  const payload = pending.map((r) => ({ method: r.method, url: r.url, body: r.body }));
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  navigator.sendBeacon("/api/sync/beacon", blob);
}
