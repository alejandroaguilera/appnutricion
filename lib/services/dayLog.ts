import { Prisma, type DayLog } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dayLogSchema, type DayLogInput } from "@/lib/validation/dayLog";

export interface UpsertDayLogResult {
  dayLog: DayLog;
  idCanonico: string; // el id que el servidor considera dueño de esa fecha
  idRecibido: string; // el id que mandó el cliente
  reasignado: boolean; // idCanonico !== idRecibido
}

// `fecha` es la clave natural del día, no `id`. Un DayLog nace con UUID de
// cliente (§0.3), pero dos dispositivos offline pueden acuñar UUID distintos
// para el MISMO día — y `fecha` es @unique. Resolver por `id` hacía que el
// segundo PUT cayera en `create` y reventara con P2002, un 500 que el outbox
// del cliente interpretaba como transitorio y reintentaba para siempre,
// atorando toda la cola detrás de él. Resolviendo por `fecha` la operación es
// idempotente de verdad: el primer UUID que llega se queda como canónico y
// los demás se pliegan a él.
export async function upsertDayLog(input: DayLogInput): Promise<UpsertDayLogResult> {
  const data = dayLogSchema.parse(input);
  const fecha = new Date(`${data.fecha}T00:00:00.000Z`);

  const campos = {
    pesoCorporalKg: data.pesoCorporalKg,
    aguaMl: data.aguaMl,
    notas: data.notas,
    animo1a5: data.animo1a5,
    hambre1a5: data.hambre1a5,
    cerradoEn: data.cerradoEn ? new Date(data.cerradoEn) : null,
    sincronizadoEn: new Date(),
  };

  const existente = await prisma.dayLog.findUnique({ where: { fecha } });

  if (existente) {
    const dayLog = await prisma.dayLog.update({
      where: { id: existente.id },
      data: { ...campos, revision: { increment: 1 } },
    });
    return {
      dayLog,
      idCanonico: dayLog.id,
      idRecibido: data.id,
      reasignado: dayLog.id !== data.id,
    };
  }

  try {
    const dayLog = await prisma.dayLog.create({
      data: { id: data.id, fecha, ...campos, revision: 1 },
    });
    return { dayLog, idCanonico: dayLog.id, idRecibido: data.id, reasignado: false };
  } catch (err) {
    // Carrera: otro escritor (drenado del outbox, Telegram) creó el día entre
    // el findUnique y el create. Se relee y se aplica encima.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const ganador = await prisma.dayLog.findUniqueOrThrow({ where: { fecha } });
      const dayLog = await prisma.dayLog.update({
        where: { id: ganador.id },
        data: { ...campos, revision: { increment: 1 } },
      });
      return {
        dayLog,
        idCanonico: dayLog.id,
        idRecibido: data.id,
        reasignado: dayLog.id !== data.id,
      };
    }
    throw err;
  }
}

export interface SerializedDayLog {
  id: string;
  fecha: string; // "YYYY-MM-DD" — NUNCA ISO completo
  pesoCorporalKg: number | null;
  aguaMl: number | null;
  notas: string | null;
  animo1a5: number | null;
  hambre1a5: number | null;
  cerradoEn: string | null;
  revision: number;
}

// Prisma serializa una columna @db.Date como ISO completo
// ("2026-08-03T00:00:00.000Z"), pero el contrato del cliente es "YYYY-MM-DD"
// y esa cadena es la clave del índice `by-fecha` de IndexedDB. Emitir el ISO
// crudo corrompía ese índice y el cliente dejaba de encontrar su propio día.
// TODA ruta que devuelva un DayLog pasa por aquí.
export function serializeDayLog(row: DayLog): SerializedDayLog {
  return {
    id: row.id,
    fecha: row.fecha.toISOString().slice(0, 10),
    pesoCorporalKg: row.pesoCorporalKg,
    aguaMl: row.aguaMl,
    notas: row.notas,
    animo1a5: row.animo1a5,
    hambre1a5: row.hambre1a5,
    cerradoEn: row.cerradoEn ? row.cerradoEn.toISOString() : null,
    revision: row.revision,
  };
}
