"use client";

import { Droplet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateDayLogField } from "@/lib/db/dayLogs";
import type { DayLogRecord } from "@/lib/db/types";

export function WaterCounter({
  fecha,
  dayLog,
  objetivoL,
  onChange,
}: {
  fecha: string;
  dayLog: DayLogRecord | null;
  objetivoL: number;
  onChange: (updated: DayLogRecord) => void;
}) {
  const aguaMl = dayLog?.aguaMl ?? 0;
  const objetivoMl = Math.round(objetivoL * 1000);

  const add = async (delta: number) => {
    const updated = await updateDayLogField(fecha, dayLog, { aguaMl: Math.max(0, aguaMl + delta) });
    onChange(updated);
  };

  return (
    <div className="flex items-center gap-3">
      <Droplet className="size-5 shrink-0 text-muted" aria-hidden />
      <span className="text-sm tabular-nums text-foreground">
        {(aguaMl / 1000).toFixed(1)} / {(objetivoMl / 1000).toFixed(1)} L
      </span>
      <Button size="sm" variant="secondary" onClick={() => void add(250)}>
        +250 ml
      </Button>
    </div>
  );
}
