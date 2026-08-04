"use client";

import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { getSyncErrors } from "@/lib/sync/client";
import { retryOutboxRecord, retryAllPermanent, discardOutboxRecord } from "@/lib/sync/drain";
import { Button } from "@/components/ui/button";
import type { OutboxRecord } from "@/lib/db/types";

// Traduce el código del servidor a algo que se entienda sin abrir la consola.
const MENSAJES: Record<string, string> = {
  validacion: "El registro tenía un campo con formato inesperado.",
  conflicto_unico: "Ya existía otro registro para ese mismo día.",
  referencia_invalida: "Apunta a un alimento o platillo que ya no existe.",
  no_encontrado: "El registro ya no está en el servidor.",
  interno: "El servidor falló al guardarlo.",
};

function describe(rec: OutboxRecord): string {
  const codigo = rec.ultimoError ?? rec.permanentError ?? "";
  if (MENSAJES[codigo]) return MENSAJES[codigo];
  if (rec.httpStatus === null) return "No se pudo conectar con el servidor.";
  return codigo || `Error ${rec.httpStatus}`;
}

function tipo(url: string): string {
  return /\/meals\//.test(url) ? "Comida" : "Día";
}

export function SyncErrorSheet({
  abierto,
  onCerrar,
  onCambio,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const [errores, setErrores] = useState<OutboxRecord[]>([]);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(() => {
    getSyncErrors().then(setErrores).catch(() => {});
  }, []);

  useEffect(() => {
    if (abierto) cargar();
  }, [abierto, cargar]);

  const conAccion = async (fn: () => Promise<void>) => {
    setOcupado(true);
    try {
      await fn();
    } finally {
      setOcupado(false);
      cargar();
      onCambio();
    }
  };

  return (
    <Dialog.Root open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-semibold text-foreground">
                Cambios sin guardar
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted">
                Están seguros en este dispositivo, pero no se han podido enviar al servidor.
                Descartar borra el registro también aquí.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Cerrar">
                <X />
              </Button>
            </Dialog.Close>
          </div>

          {errores.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Ya no hay nada pendiente.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {errores.map((rec) => (
                  <li
                    key={rec.seq}
                    className="rounded-xl border border-border bg-surface-raised p-3 text-sm"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-foreground">{tipo(rec.url)}</span>
                      <span className="text-xs text-muted">
                        {rec.ultimoIntentoEn
                          ? new Date(rec.ultimoIntentoEn).toLocaleTimeString("es-MX", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{describe(rec)}</p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={ocupado}
                        onClick={() => conAccion(() => retryOutboxRecord(rec.seq!))}
                      >
                        Reintentar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={ocupado}
                        onClick={() => conAccion(() => discardOutboxRecord(rec.seq!))}
                      >
                        Descartar el registro
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>

              <Button
                className="mt-4 w-full"
                disabled={ocupado}
                onClick={() => conAccion(() => retryAllPermanent())}
              >
                Reintentar todo
              </Button>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
