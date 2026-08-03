import { NextRequest, NextResponse } from "next/server";
import { upsertDayLog } from "@/lib/services/dayLog";
import { upsertMealEntry } from "@/lib/services/mealEntry";

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
export async function POST(req: NextRequest) {
  let items: BeaconItem[];
  try {
    items = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  for (const item of items) {
    try {
      const mealMatch = item.url.match(MEAL_RE);
      const dayMatch = item.url.match(DAY_RE);

      if (mealMatch) {
        const [, dayLogId, mealId] = mealMatch;
        await upsertMealEntry({ ...(item.body as object), id: mealId, dayLogId } as never);
      } else if (dayMatch) {
        const [, dayLogId] = dayMatch;
        await upsertDayLog({ ...(item.body as object), id: dayLogId } as never);
      }
    } catch {
      // Best-effort: un ítem malo en el batch del beacon no debe tirar el
      // resto. El drenado normal del outbox lo reintentará en la próxima carga.
      continue;
    }
  }

  return NextResponse.json({ ok: true });
}
