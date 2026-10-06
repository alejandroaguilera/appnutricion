import { Suspense } from "react";
import { Screen } from "@/components/shell/Screen";
import { RegistrarSlot } from "@/components/registrar/RegistrarSlot";

export default function RegistrarSlotPage() {
  return (
    <Suspense
      fallback={
        <Screen sinTabs>
          <p className="text-sm text-muted">Cargando…</p>
        </Screen>
      }
    >
      <RegistrarSlot />
    </Suspense>
  );
}
