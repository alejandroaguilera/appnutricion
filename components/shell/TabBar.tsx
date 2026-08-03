"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, CalendarDays, ClipboardList, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/hoy", label: "Hoy", Icon: Sun },
  { href: "/historial", label: "Historial", Icon: CalendarDays },
  { href: "/plan", label: "Plan", Icon: ClipboardList },
  { href: "/ajustes", label: "Ajustes", Icon: Settings },
];

// Registrar una comida es una TAREA, no un destino: mientras dura, la barra
// desaparece para que la pantalla sea completa y no haya forma de salirse a
// medias por accidente.
const RUTAS_SIN_TABS = [/^\/registrar/, /^\/comida\//];

export function TabBar() {
  const pathname = usePathname();
  if (RUTAS_SIN_TABS.some((re) => re.test(pathname))) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {TABS.map(({ href, label, Icon }) => {
          const activo = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  activo ? "text-primary" : "text-muted"
                )}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
