import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { upsertDayLog, serializeDayLog } from "@/lib/services/dayLog";
import { serializeMealEntry, mealEntryInclude } from "@/lib/services/mealEntry";
import { withRoute, jsonError } from "@/lib/http/route";

type Ctx = { params: Promise<{ id: string }> };

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Lectura delta del día (§5.4.3). El segmento es polimórfico —id o fecha—
// porque Next no admite un `[fecha]` hermano de `[id]`; el spec pide
// `GET /api/days/[fecha]` y esto lo satisface literalmente.
//
// `revision` se usa como DETECTOR de cambio, no como cursor: si el cliente
// está atrasado se le manda el día entero (~6 entradas). Un cursor por
// entrada sería más código y más superficie de error para ahorrar bytes que
// no importan a esta escala.
export const GET = withRoute<Ctx>("days.get", async (req: NextRequest, { params }) => {
  const { id } = await params;
  const desde = Number(req.nextUrl.searchParams.get("desde_revision") ?? "0");

  const where = ES_FECHA.test(id) ? { fecha: new Date(`${id}T00:00:00.000Z`) } : { id };

  const dayLog = await prisma.dayLog.findUnique({
    where,
    include: {
      // Se incluyen las archivadas: el cliente necesita saber qué borrar.
      // Un borrado físico es indistinguible de "aún no lo conozco" y produce
      // resurrecciones (§5.4.4).
      meals: { orderBy: { horaRegistro: "asc" }, include: mealEntryInclude },
    },
  });

  if (!dayLog) {
    return NextResponse.json({
      fecha: ES_FECHA.test(id) ? id : null,
      revision: 0,
      dayLog: null,
      meals: [],
    });
  }

  const serializado = serializeDayLog(dayLog);

  if (Number.isFinite(desde) && desde >= dayLog.revision) {
    return NextResponse.json({ fecha: serializado.fecha, revision: dayLog.revision, sinCambios: true });
  }

  return NextResponse.json({
    fecha: serializado.fecha,
    revision: dayLog.revision,
    dayLog: serializado,
    meals: dayLog.meals.map(serializeMealEntry),
  });
});

export const PUT = withRoute<Ctx>("days.put", async (req: NextRequest, { params }) => {
  const { id } = await params;
  if (ES_FECHA.test(id)) return jsonError(400, "id_esperado");

  const body = await req.json();
  const res = await upsertDayLog({ ...body, id });
  return NextResponse.json({
    dayLog: serializeDayLog(res.dayLog),
    idCanonico: res.idCanonico,
    idRecibido: res.idRecibido,
    reasignado: res.reasignado,
  });
});
