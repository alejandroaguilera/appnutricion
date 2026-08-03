"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIosSafariStandaloneCapable(): boolean {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return isIos && !isStandalone;
}

// Chrome/Android disparan `beforeinstallprompt`; iOS Safari no lo soporta en
// absoluto, así que ahí se muestra un hint estático en su lugar. Se
// descarta si ya está instalada (`display-mode: standalone`).
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    // Diferido: depende de navigator/UA, que solo existe tras la hidratación.
    if (isIosSafariStandaloneCapable()) queueMicrotask(() => setShowIosHint(true));

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  if (dismissed || (!deferredPrompt && !showIosHint)) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
      {deferredPrompt ? (
        <>
          <span className="text-sm text-foreground">Instala la app para usarla sin conexión.</span>
          <Button
            size="sm"
            onClick={async () => {
              await deferredPrompt.prompt();
              await deferredPrompt.userChoice;
              setDeferredPrompt(null);
            }}
          >
            <Download className="size-4" />
            Instalar
          </Button>
        </>
      ) : (
        <span className="text-sm text-foreground">
          Para instalarla: toca Compartir → Agregar a inicio.
        </span>
      )}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => setDismissed(true)}
        className="shrink-0 text-sm text-muted"
      >
        ✕
      </button>
    </div>
  );
}
