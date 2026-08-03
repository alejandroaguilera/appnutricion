"use client";

import { useEffect } from "react";
import { initSyncListeners } from "@/lib/sync/flush";
import { hydrateCatalog } from "@/lib/db/catalogSync";

// Arranca, una sola vez por carga de la app: los listeners de flush del
// outbox (§4) y la hidratación de catálogo/platillos/plan en IndexedDB (§4,
// "se sincronizan por adelantado"). Vuelve a hidratar al reconectar, para
// que un cambio de plan hecho en otra sesión no quede desactualizado.
export function AppInit() {
  useEffect(() => {
    initSyncListeners();
    void hydrateCatalog();

    const onOnline = () => void hydrateCatalog();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return null;
}
