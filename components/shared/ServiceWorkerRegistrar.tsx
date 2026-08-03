"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Best-effort: la app sigue funcionando sin service worker, solo sin
      // caché de app-shell offline.
    });
  }, []);

  return null;
}
