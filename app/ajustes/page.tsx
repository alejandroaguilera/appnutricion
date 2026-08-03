"use client";

import { useEffect, useState } from "react";
import { getDB } from "@/lib/db/indexeddb";
import { resetLocalData } from "@/lib/db/repair";
import { hydrateCatalog } from "@/lib/db/catalogSync";
import { reconcileDays } from "@/lib/sync/reconcile";
import { localDayString } from "@/lib/date";
import { getSyncStatus, type SyncStatus } from "@/lib/sync/client";
import { Screen } from "@/components/shell/Screen";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const CLAVE_FOTOS = "appnutricion:fotosHabilitadas";

export default function AjustesPage() {
  const [fotos, setFotos] = useState(true);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [reparando, setReparando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    // Lectura diferida: localStorage no existe durante el prerender, así que
    // el valor real solo puede llegar después de la hidratación.
    queueMicrotask(() => setFotos(localStorage.getItem(CLAVE_FOTOS) !== "0"));
    void getSyncStatus().then(setStatus);
  }, []);

  const cambiarFotos = (v: boolean) => {
    setFotos(v);
    localStorage.setItem(CLAVE_FOTOS, v ? "1" : "0");
  };

  // Escotilla de escape: si los datos locales quedaran inconsistentes, el
  // servidor es autoritativo y una reconciliación reconstruye todo. Se
  // preserva el outbox, que es lo único que el servidor todavía no sabe.
  const repararLocal = async () => {
    setReparando(true);
    setMensaje(null);
    try {
      await resetLocalData(await getDB());
      await hydrateCatalog();
      await reconcileDays([localDayString()]);
      setMensaje("Datos locales reconstruidos desde el servidor.");
    } catch {
      setMensaje("No se pudo reconstruir. Revisa la conexión e inténtalo de nuevo.");
    } finally {
      setReparando(false);
      void getSyncStatus().then(setStatus);
    }
  };

  return (
    <Screen>
      <header>
        <h1 className="text-lg font-semibold text-foreground">Ajustes</h1>
      </header>

      <Card className="p-4">
        <h2 className="text-sm font-medium text-foreground">Fotos de comida</h2>
        {/* Nota de privacidad exigida por §3.2, en una línea. */}
        <p className="mt-1 text-xs text-muted">
          Al estimar con foto, la imagen se envía a un proveedor externo de IA para calcular las
          porciones. Nunca se envía tu peso ni tus métricas corporales.
        </p>
        <label className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm text-foreground">Permitir estimación por foto</span>
          <input
            type="checkbox"
            checked={fotos}
            onChange={(e) => cambiarFotos(e.target.checked)}
            className="size-5 accent-[var(--primary)]"
          />
        </label>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-medium text-foreground">Sincronización</h2>
        <p className="mt-1 text-xs text-muted">
          {status
            ? `${status.pendientes} pendiente${status.pendientes === 1 ? "" : "s"}` +
              (status.conError > 0 ? ` · ${status.conError} con error` : "")
            : "…"}
        </p>
        <Button
          variant="secondary"
          className="mt-3 w-full"
          disabled={reparando}
          onClick={() => void repararLocal()}
        >
          {reparando ? "Reconstruyendo…" : "Reconstruir datos locales"}
        </Button>
        <p className="mt-2 text-[11px] text-muted">
          Borra la copia local y la vuelve a bajar del servidor. Los cambios que aún no se han
          enviado se conservan.
        </p>
        {mensaje && <p className="mt-2 text-xs text-primary">{mensaje}</p>}
      </Card>
    </Screen>
  );
}
