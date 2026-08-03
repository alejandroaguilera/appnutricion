"use client";

import { useEffect } from "react";
import { initSyncListeners, onDrained } from "@/lib/sync/flush";
import { reconcileDays } from "@/lib/sync/reconcile";
import { hydrateCatalog } from "@/lib/db/catalogSync";
import { getDB, getRepairReport } from "@/lib/db/indexeddb";
import { localDayString } from "@/lib/date";

// Arranca, una sola vez por carga de la app: los listeners de flush del
// outbox (§4), la hidratación de catálogo/platillos/plan en IndexedDB (§4) y
// la reconciliación del día en curso (§5.4.3). Vuelve a hidratar al
// reconectar, para que un cambio de plan hecho en otra sesión no quede
// desactualizado.
export function AppInit() {
  useEffect(() => {
    // Tras drenar el outbox se reconcilian los días tocados: así el id
    // canónico que decidió el servidor baja al cliente de inmediato en vez de
    // esperar al siguiente montaje.
    onDrained((r) => {
      if (r.fechasAfectadas.length > 0) void reconcileDays(r.fechasAfectadas);
    });

    initSyncListeners();
    void hydrateCatalog();
    void reconcileDays([localDayString()]);

    // La migración v2 corre una sola vez en el dispositivo y es irreversible;
    // su reporte es la única evidencia de qué encontró y qué reparó.
    void getDB().then(() => {
      const reporte = getRepairReport();
      if (reporte) console.info("[appnutricion] reparación IndexedDB v2", reporte);
    });

    const onOnline = () => {
      void hydrateCatalog();
      void reconcileDays([localDayString()]);
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      onDrained(null);
    };
  }, []);

  return null;
}
