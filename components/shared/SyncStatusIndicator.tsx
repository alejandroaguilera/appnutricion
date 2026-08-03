"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudUpload, CloudAlert } from "lucide-react";
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from "@/lib/sync/client";
import { SyncErrorSheet } from "./SyncErrorSheet";
import { cn } from "@/lib/utils";

// Discreto, nunca alarmista (§4): estar sin sincronizar es un estado normal,
// no un error. Sin rojo, sin spinner que bloquee nada.
//
// Pero un fallo real SÍ tiene que verse. Durante toda la ronda anterior el
// outbox estuvo atorado y este indicador solo mostraba "N cambios pendientes",
// indistinguible de "voy en camino" — por eso la pérdida de registros pasó
// desapercibida. El estado de atención usa color de aviso, no de peligro: la
// regla de lenguaje del §7.4 aplica a todo el producto, no solo a la comida.
export function SyncStatusIndicator() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [abierto, setAbierto] = useState(false);

  const refresh = useCallback(() => {
    getSyncStatus().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeSyncStatus(refresh);
    const interval = setInterval(refresh, 5000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [refresh]);

  if (!status) return null;
  const { pendientes, conError } = status;
  if (pendientes === 0 && conError === 0) return null;

  const plural = (n: number, s: string, p: string) => (n === 1 ? s : p);

  return (
    <>
      <button
        type="button"
        onClick={() => conError > 0 && setAbierto(true)}
        disabled={conError === 0}
        className={cn(
          "fixed right-3 z-30 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs backdrop-blur",
          "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]",
          conError > 0
            ? "border-warning/40 bg-warning/10 text-warning"
            : "border-border bg-surface/90 text-muted"
        )}
      >
        {conError > 0 ? <CloudAlert className="size-3.5" /> : <CloudUpload className="size-3.5" />}
        <span>
          {conError > 0
            ? `${conError} ${plural(conError, "cambio sin guardar", "cambios sin guardar")}`
            : `${pendientes} ${plural(pendientes, "cambio pendiente", "cambios pendientes")}`}
        </span>
      </button>

      <SyncErrorSheet abierto={abierto} onCerrar={() => setAbierto(false)} onCambio={refresh} />
    </>
  );
}
