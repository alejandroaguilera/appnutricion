import { cn } from "@/lib/utils";

// Contenedor único de pantalla. El `pb` reserva el espacio de la barra de
// pestañas (h-16 + safe area) más el indicador de sync que flota encima —
// antes cada pantalla llevaba su propio `pb-24` a ojo.
export function Screen({
  children,
  sinTabs = false,
  className,
}: {
  children: React.ReactNode;
  sinTabs?: boolean;
  className?: string;
}) {
  return (
    <main
      className={cn(
        "mx-auto flex max-w-md flex-col gap-6 p-4",
        sinTabs ? "pb-6" : "pb-[calc(9rem+env(safe-area-inset-bottom))]",
        className
      )}
    >
      {children}
    </main>
  );
}
