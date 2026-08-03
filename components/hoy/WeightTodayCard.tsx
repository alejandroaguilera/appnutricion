"use client";

import { useState } from "react";
import { Scale } from "lucide-react";
import { updateDayLogField } from "@/lib/db/dayLogs";
import type { DayLogRecord } from "@/lib/db/types";

// Peso de hoy — este ciclo es entrada manual directa a DayLog.pesoCorporalKg.
// La sincronización automática desde appgym (§5.1) es una ronda futura; sin
// ella, esta es la única fuente de "peso de hoy" disponible.
export function WeightTodayCard({
  fecha,
  dayLog,
  onChange,
}: {
  fecha: string;
  dayLog: DayLogRecord | null;
  onChange: (updated: DayLogRecord) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(dayLog?.pesoCorporalKg?.toString() ?? "");

  const commit = async () => {
    setEditing(false);
    const n = Number(value);
    const updated = await updateDayLogField(fecha, {
      pesoCorporalKg: value.trim() === "" || Number.isNaN(n) ? null : n,
    });
    onChange(updated);
  };

  return (
    <div className="flex items-center gap-3">
      <Scale className="size-5 shrink-0 text-muted" aria-hidden />
      {editing ? (
        <input
          type="number"
          inputMode="decimal"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="w-20 rounded-lg border border-border bg-surface-raised px-2 py-1 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm tabular-nums text-foreground underline decoration-border underline-offset-4"
        >
          {dayLog?.pesoCorporalKg != null ? `${dayLog.pesoCorporalKg} kg` : "Registrar peso"}
        </button>
      )}
    </div>
  );
}
