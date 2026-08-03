import * as React from "react";
import { cn } from "@/lib/utils";

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, selected, ...props }, ref) => {
    return (
      <button
        type="button"
        ref={ref}
        className={cn(
          "h-11 min-w-11 px-4 rounded-full border text-sm font-medium transition-[background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          selected
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-surface-raised text-foreground border-border hover:bg-surface",
          className
        )}
        aria-pressed={selected}
        {...props}
      />
    );
  }
);
Chip.displayName = "Chip";

export { Chip };
