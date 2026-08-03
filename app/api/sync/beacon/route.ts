import { NextRequest, NextResponse } from "next/server";
import { upsertDayLog } from "@/lib/services/dayLog";
import { upsertMealEntry } from "@/lib/services/mealEntry";
import { withRoute } from "@/lib/http/route";
import { logEvent, errorInfo } from "@/lib/log";

interface BeaconItem {
  method: "PUT" | "DELETE" | "POST";
  url: string;
  body: unknown;
}

const DAY_RE = /^\/api\/days\/([^/]+)$/;
const MEAL_RE = /^\/api\/days\/([^/]+)\/meals\/([^/]+)$/;

// Repite lo que quedó pendiente en el outbox del cliente al momento del
// desmontaje (pagehide), vía navigator.sendBeacon. Usa las mismas funciones
// de servicio idempotentes que las rutas PUT normales — este es un fallback
// de entrega best-effort, nunca el mecanismo de durabilidad en sí (eso es la
// escritura síncrona en IndexedDB, §4).
export const POST = withRoute<unknown>("sync.beacon", async (req: NextRequest) => {
  let items: BeaconItem[];
  try {
    items = await req.json();
  } catch {
    return NextResponse.json({ error: true, codigo: "payload_invalido" }, { status: 400 });
  }
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: true, codigo: "payload_invalido" }, { status: 400 });
  }

  let entregados = 0;
  let fallidos = 0;

  for (const item of items) {
    try {
      const mealMatch = item.url.match(MEAL_RE);
      const dayMatch = item.url.match(DAY_RE);

      if (mealMatch) {
        const [, dayLogId, mealId] = mealMatch;
        await upsertMealEntry({ ...(item.body as object), id: mealId, dayLogId } as never);
        entregados++;
      } else if (dayMatch) {
        const [, dayLogId] = dayMatch;
        await upsertDayLog({ ...(item.body as object), id: dayLogId } as never);
        entregados++;
      }
    } catch (err) {
      // Best-effort: un ítem malo en el batch del beacon no debe tirar el
      // resto. El drenado normal del outbox lo reintentará. Pero SÍ se
      // registra — antes se tragaba en silencio y no quedaba rastro alguno.
      fallidos++;
      logEvent("beacon_item_error", { url: item.url, ...errorInfo(err) });
    }
  }

  logEvent("beacon", { recibidos: items.length, entregados, fallidos });
  return NextResponse.json({ ok: true, entregados, fallidos });
});
