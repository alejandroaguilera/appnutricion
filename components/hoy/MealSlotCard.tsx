import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlanSlotRecord } from "@/lib/db/types";

export interface SlotMealSummary {
  id: string;
  titulo: string;
  detalle: string;
  kcal: number;
  origen: "app" | "telegram" | "import";
}

export function MealSlotCard({
  slot,
  meals,
}: {
  slot: PlanSlotRecord;
  meals: SlotMealSummary[];
}) {
  const registrado = meals.length > 0;

  return (
    <Card className={cn("p-4", slot.esOpcional && !registrado && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">{slot.nombre}</p>
          <p className="text-xs text-muted">
            {slot.horaSugerida}
            {slot.esOpcional ? " · opcional" : ""}
          </p>
        </div>
        {!registrado && (
          <Button asChild size="icon" variant="secondary" aria-label={`Registrar ${slot.nombre}`}>
            <Link href={`/registrar/${slot.clave}`}>+</Link>
          </Button>
        )}
      </div>

      {registrado ? (
        <ul className="mt-3 flex flex-col gap-2">
          {meals.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 text-foreground">
                {m.origen === "telegram" && (
                  <MessageCircle className="size-3.5 shrink-0 text-muted" aria-label="Registrado por Telegram" />
                )}
                {m.titulo}
                <span className="text-muted"> — {m.detalle}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted">{Math.round(m.kcal)} kcal</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Pendiente</p>
      )}
    </Card>
  );
}
