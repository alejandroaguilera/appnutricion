"use client";

import { useState } from "react";
import { updateDayLogField } from "@/lib/db/dayLogs";
import type { DayLogRecord } from "@/lib/db/types";

export function DayNoteField({
  fecha,
  dayLog,
  onChange,
}: {
  fecha: string;
  dayLog: DayLogRecord | null;
  onChange: (updated: DayLogRecord) => void;
}) {
  const [value, setValue] = useState(dayLog?.notas ?? "");

  const commit = async () => {
    const updated = await updateDayLogField(fecha, { notas: value.trim() === "" ? null : value });
    onChange(updated);
  };

  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      placeholder="Nota del día (opcional)"
      rows={2}
      className="w-full resize-none rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    />
  );
}
