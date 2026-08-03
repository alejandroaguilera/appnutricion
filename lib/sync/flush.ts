import { drainOutbox } from "./drain";
import { listOutbox } from "@/lib/db/outbox";

let listenersRegistered = false;

// Registra los disparadores de flush requeridos por §4/§5.4: visibilitychange
// y pagehide, NO solo beforeunload (poco confiable en móvil). beforeunload
// se agrega igual como ayuda extra best-effort, nunca como única garantía.
export function initSyncListeners(): void {
  if (listenersRegistered || typeof window === "undefined") return;
  listenersRegistered = true;

  const trigger = () => {
    void triggerFlush();
  };

  document.addEventListener("visibilitychange", trigger);
  window.addEventListener("pagehide", trigger);
  window.addEventListener("online", trigger);
  window.addEventListener("beforeunload", trigger);

  // Poll periódico ligero mientras la pestaña está visible y online; nunca es
  // el mecanismo de corrección — la escritura en IndexedDB ya ocurrió antes.
  setInterval(() => {
    if (document.visibilityState === "visible" && navigator.onLine) trigger();
  }, 15_000);

  trigger();
}

export async function triggerFlush(): Promise<void> {
  await drainOutbox();
  await sendBeaconFallback();
}

// sendBeacon es el único mecanismo que el navegador garantiza intentar
// durante el desmontaje en pagehide/unload, ya que un fetch() en curso puede
// abortarse a mitad de camino. No reemplaza drainOutbox — es una entrega
// paralela best-effort de lo que siga pendiente al momento del desmontaje.
async function sendBeaconFallback(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) return;
  const pending = (await listOutbox()).filter((r) => !r.permanentError);
  if (pending.length === 0) return;
  const payload = pending.map((r) => ({ method: r.method, url: r.url, body: r.body }));
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  navigator.sendBeacon("/api/sync/beacon", blob);
}
