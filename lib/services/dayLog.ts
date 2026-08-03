import { prisma } from "@/lib/prisma";
import { dayLogSchema, type DayLogInput } from "@/lib/validation/dayLog";

// Idempotente por id. `revision` se incrementa server-side en cada
// escritura, venga de donde venga (§5.4) — base de la reconciliación
// multi-escritor que llega en la siguiente ronda.
export async function upsertDayLog(input: DayLogInput) {
  const data = dayLogSchema.parse(input);
  const fecha = new Date(`${data.fecha}T00:00:00.000Z`);

  return prisma.dayLog.upsert({
    where: { id: data.id },
    create: {
      id: data.id,
      fecha,
      pesoCorporalKg: data.pesoCorporalKg,
      aguaMl: data.aguaMl,
      notas: data.notas,
      animo1a5: data.animo1a5,
      hambre1a5: data.hambre1a5,
      cerradoEn: data.cerradoEn ? new Date(data.cerradoEn) : null,
      sincronizadoEn: new Date(),
      revision: 1,
    },
    update: {
      pesoCorporalKg: data.pesoCorporalKg,
      aguaMl: data.aguaMl,
      notas: data.notas,
      animo1a5: data.animo1a5,
      hambre1a5: data.hambre1a5,
      cerradoEn: data.cerradoEn ? new Date(data.cerradoEn) : null,
      sincronizadoEn: new Date(),
      revision: { increment: 1 },
    },
  });
}
