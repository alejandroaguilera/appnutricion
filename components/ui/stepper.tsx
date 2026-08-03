"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepperProps {
  label: string;
  value: number;
  step: number;
  min?: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
  className?: string;
}

// Steppers + entrada numérica directa, suficientemente grandes para tocar
// con fiabilidad. El número es un input nativo, así que también se puede
// escribir un valor preciso directamente.
export function Stepper({
  label,
  value,
  step,
  min = 0,
  onChange,
  formatValue,
  className,
}: StepperProps) {
  const clamp = (v: number) => Math.max(min, Math.round(v * 100) / 100);

  return (
    <div className={cn("flex min-w-0 flex-1 flex-col items-center gap-1", className)}>
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <div className="flex w-full min-w-0 items-center gap-1.5">
        <button
          type="button"
          aria-label={`Restar ${label}`}
          onClick={() => onChange(clamp(value - step))}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-raised active:bg-border"
        >
          <Minus className="size-5" />
        </button>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) onChange(clamp(n));
          }}
          className="w-full min-w-0 rounded-xl border border-border bg-surface-raised py-2 text-center text-2xl font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <button
          type="button"
          aria-label={`Sumar ${label}`}
          onClick={() => onChange(clamp(value + step))}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-raised active:bg-border"
        >
          <Plus className="size-5" />
        </button>
      </div>
      {formatValue && <span className="text-xs text-muted">{formatValue(value)}</span>}
    </div>
  );
}
