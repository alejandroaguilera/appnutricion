"use client";

import { useEffect, useState } from "react";
import { CloudUpload } from "lucide-react";
import { getPendingCount, subscribeSyncStatus } from "@/lib/sync/client";
import { cn } from "@/lib/utils";

// Discreto, nunca alarmista (§4): estar sin sincronizar es un estado normal,
// no un error. Sin rojo, sin spinner que bloquee nada.
export function SyncStatusIndicator() {
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      getPendingCount().then((n) => {
        if (mounted) setPending(n);
      });
    };
    refresh();
    const unsubscribe = subscribeSyncStatus(refresh);
    const interval = setInterval(refresh, 5000);
    return () => {
      mounted = false;
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  // No persistente: solo aparece mientras hay algo sin confirmar en el
  // servidor. En cuanto sincroniza, desaparece.
  if (pending === null || pending === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-3 z-30 flex items-center gap-1.5 rounded-full border border-border bg-surface/90 px-3 py-1.5 text-xs text-muted backdrop-blur"
      )}
    >
      <CloudUpload className="size-3.5" />
      <span>{pending} cambio{pending === 1 ? "" : "s"} pendiente{pending === 1 ? "" : "s"}</span>
    </div>
  );
}
