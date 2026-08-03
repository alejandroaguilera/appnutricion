import { prisma } from "@/lib/prisma";
import { localDayString, APP_TIME_ZONE } from "@/lib/date";
import { logEvent, errorInfo } from "@/lib/log";
import { reclassifyPending } from "./reclassify";
import { enviarResumenDiario, enviarRevisionSemanal } from "./telegramSalientes";
import { procesarUpdate, type TelegramUpdate } from "@/lib/telegram/router";

const INTERVALO_MS = 60_000;
const MAX_INTENTOS = 3;
const SWEEP_ANTIGUEDAD_MS = 2 * 60_000;

let arrancado = false;

export interface TickReport {
  encolados: number;
  ejecutados: number;
  fallidos: number;
  updatesBarridos: number;
  reclasificadas: number;
}

// Convierte "HH:MM local" del día `fecha` a un instante UTC. Se calcula con
// Intl y no sumando un offset fijo: America/Matamoros tiene horario de
// verano, así que un offset constante desfasaría media hora del año.
function horaLocalAUtc(fecha: string, hora: number, minuto: number): Date {
  const tentativa = new Date(`${fecha}T${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}:00Z`);
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(tentativa)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {} as Record<string, string>);

  const comoUtc = Date.UTC(
    +partes.year,
    +partes.month - 1,
    +partes.day,
    +partes.hour,
    +partes.minute,
    +partes.second
  );
  const offset = comoUtc - tentativa.getTime();
  return new Date(tentativa.getTime() - offset);
}

async function encolarTrabajosDelDia(): Promise<number> {
  const fecha = localDayString();
  const trabajos: { clave: string; tipo: string; ejecutarEn: Date }[] = [
    // 21:30 diario: resumen del día (§6.7).
    { clave: `resumen_diario:${fecha}`, tipo: "resumen_diario", ejecutarEn: horaLocalAUtc(fecha, 21, 30) },
  ];

  // Domingo 09:00: revisión semanal.
  const diaSemana = new Date(`${fecha}T12:00:00`).getDay();
  if (diaSemana === 0) {
    trabajos.push({
      clave: `revision_semanal:${fecha}`,
      tipo: "revision_semanal",
      ejecutarEn: horaLocalAUtc(fecha, 9, 0),
    });
  }

  // La clave es `tipo:fecha`, así que encolar es naturalmente idempotente.
  const res = await prisma.scheduledJob.createMany({ data: trabajos, skipDuplicates: true });
  return res.count;
}

async function ejecutarTrabajo(tipo: string): Promise<void> {
  switch (tipo) {
    case "resumen_diario":
      await enviarResumenDiario();
      return;
    case "revision_semanal":
      await enviarRevisionSemanal();
      return;
    default:
      logEvent("job_tipo_desconocido", { tipo });
  }
}

async function reclamarYEjecutar(): Promise<{ ejecutados: number; fallidos: number }> {
  const pendientes = await prisma.scheduledJob.findMany({
    where: { completadoEn: null, ejecutarEn: { lte: new Date() }, intentos: { lt: MAX_INTENTOS } },
    take: 5,
  });

  let ejecutados = 0;
  let fallidos = 0;

  for (const job of pendientes) {
    // Reclamo atómico de un solo uso: si dos instancias corrieran el tick a la
    // vez, solo una gana el updateMany.
    const reclamo = await prisma.scheduledJob.updateMany({
      where: { clave: job.clave, reclamadoEn: null },
      data: { reclamadoEn: new Date() },
    });
    if (reclamo.count !== 1) continue;

    try {
      await ejecutarTrabajo(job.tipo);
      await prisma.scheduledJob.update({
        where: { clave: job.clave },
        data: { completadoEn: new Date(), error: null },
      });
      ejecutados++;
      logEvent("job_ok", { clave: job.clave });
    } catch (err) {
      fallidos++;
      await prisma.scheduledJob.update({
        where: { clave: job.clave },
        data: {
          reclamadoEn: null,
          intentos: { increment: 1 },
          error: errorInfo(err).msg.slice(0, 300),
        },
      });
      logEvent("job_error", { clave: job.clave, ...errorInfo(err) });
    }
  }

  return { ejecutados, fallidos };
}

// Red de seguridad del webhook: si el proceso murió entre el 200 y el final
// del procesamiento, el update quedó sin `procesadoEn` y aquí se retoma.
async function barrerUpdates(): Promise<number> {
  const viejos = await prisma.telegramUpdate.findMany({
    where: {
      procesadoEn: null,
      intentos: { lt: MAX_INTENTOS },
      recibidoEn: { lt: new Date(Date.now() - SWEEP_ANTIGUEDAD_MS) },
    },
    take: 5,
    orderBy: { recibidoEn: "asc" },
  });

  let barridos = 0;
  for (const u of viejos) {
    try {
      const mealEntryId = await procesarUpdate(u.payloadCrudo as unknown as TelegramUpdate);
      await prisma.telegramUpdate.update({
        where: { updateId: u.updateId },
        data: { procesadoEn: new Date(), mealEntryId: mealEntryId ?? undefined },
      });
      barridos++;
    } catch (err) {
      await prisma.telegramUpdate.update({
        where: { updateId: u.updateId },
        data: { intentos: { increment: 1 }, error: errorInfo(err).msg.slice(0, 300) },
      });
    }
  }
  return barridos;
}

export async function tick(): Promise<TickReport> {
  const encolados = await encolarTrabajosDelDia();
  const { ejecutados, fallidos } = await reclamarYEjecutar();
  const updatesBarridos = await barrerUpdates();
  const { clasificadas } = await reclassifyPending(3);
  return { encolados, ejecutados, fallidos, updatesBarridos, reclasificadas: clasificadas };
}

// No hay cron en el contenedor ni forma de instalarlo, así que el reloj vive
// en el proceso. `ScheduledJob` es lo que hace que eso sea seguro: el estado
// está en la base, no en memoria, y un reinicio no pierde ni duplica nada.
export function startScheduler(): void {
  if (arrancado) return;
  if (process.env.SCHEDULER_ENABLED === "0") return;
  arrancado = true;

  const correr = () => {
    void tick().catch((err) => logEvent("scheduler_tick_error", errorInfo(err)));
  };

  setTimeout(correr, 10_000);
  setInterval(correr, INTERVALO_MS);
  logEvent("scheduler_arrancado", { intervaloMs: INTERVALO_MS });
}
