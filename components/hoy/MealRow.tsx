import Link from "next/link";
import { MessageCircle, Clock } from "lucide-react";
import { bucketNombreForClave } from "@/lib/nutrition/groups";
import type { MealEntryRecord, MealEntryPortionRecord } from "@/lib/db/types";

// Renglón por comida, al estilo de las capturas de referencia: qué fue,
// cuánto, a qué hora y su aporte. Es la superficie que de verdad se lee — la
// cuadrícula de porciones del §3.1 se conserva debajo como verificación del
// plan, no como la lista principal.
export function MealRow({
  entry,
  portions,
  slotNombre,
}: {
  entry: MealEntryRecord;
  portions: MealEntryPortionRecord[];
  slotNombre: string;
}) {
  const kcal = portions.reduce((a, p) => a + p.kcal, 0);
  const proteina = portions.reduce((a, p) => a + p.proteinaG, 0);

  // Si las porciones traen nombre (registro por IA o por platillo detallado)
  // se listan tal cual; si no, se cae a las etiquetas de grupo.
  const conNombre = portions.filter((p) => p.nombre);
  const detalle =
    conNombre.length > 0
      ? conNombre.map((p) => [p.nombre, p.cantidad].filter(Boolean).join(" ")).join(", ")
      : portions
          .filter((p) => p.porciones > 0)
          .map((p) =>
            p.foodGroupClave ? `${p.porciones} ${bucketNombreForClave(p.foodGroupClave)}` : null
          )
          .filter(Boolean)
          .join(" · ");

  const hora = entry.horaRegistro.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  const pendiente = entry.estadoClasificacion === "pendiente";

  return (
    <li>
      <Link
        href={`/comida/${entry.id}`}
        className="flex items-start gap-3 border-b border-border py-3 last:border-b-0"
      >
        {entry.fotoPrincipalId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/photos/${entry.fotoPrincipalId}?mini=1`}
            alt=""
            className="size-11 shrink-0 rounded-lg object-cover"
          />
        )}

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            {entry.origen === "telegram" && (
              <MessageCircle className="size-3.5 shrink-0 text-muted" aria-label="Registrado por Telegram" />
            )}
            <span className="truncate">{entry.titulo ?? slotNombre}</span>
          </p>
          {detalle && <p className="truncate text-xs text-muted">{detalle}</p>}
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
            <Clock className="size-3" />
            {hora}
            {pendiente && <span className="text-warning"> · sin clasificar</span>}
          </p>
        </div>

        <div className="shrink-0 text-right text-sm tabular-nums">
          <p className="text-foreground">{Math.round(kcal)} kcal</p>
          <p className="text-xs text-muted">{Math.round(proteina)} g P</p>
        </div>
      </Link>
    </li>
  );
}
