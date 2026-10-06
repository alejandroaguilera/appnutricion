// Zona horaria real de los datos del atleta (CSV histórico, §10.4) — no la
// de appgym (America/Mexico_City), que no tiene horario de verano.
export const APP_TIME_ZONE = "America/Matamoros";

// "Hoy" (o cualquier Date) como "YYYY-MM-DD" en el huso horario de la app —
// reemplaza el patrón `toISOString().slice(0,10)`, que usa UTC y puede
// desplazar la fecha calendario cerca de medianoche local.
export function localDayString(date: Date = new Date(), timeZone: string = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    date
  );
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {} as Record<string, string>);
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUTC - date.getTime();
}

// Límites [inicio, fin) en UTC del día calendario local que contiene `date`.
export function localDayBounds(
  date: Date = new Date(),
  timeZone: string = APP_TIME_ZONE
): { start: Date; end: Date } {
  const offset = tzOffsetMs(date, timeZone);
  const dayStr = localDayString(date, timeZone);
  const startMs = new Date(`${dayStr}T00:00:00.000Z`).getTime() - offset;
  return { start: new Date(startMs), end: new Date(startMs + 86_400_000) };
}

// Una columna @db.Date (ej. DayLog.fecha) viaja como ISO UTC-medianoche
// ("2026-08-03T00:00:00.000Z" *es* el 3 de agosto, sin ambigüedad). Formatear
// eso con un Intl.DateTimeFormat sin `timeZone` explícito cae en el huso del
// visor, y en cualquier huso detrás de UTC se ve un día antes. Se extraen los
// componentes Y-M-D tal como se guardaron y se reconstruye un Date a
// medianoche LOCAL, para que cualquier formateo/orden/comparación posterior
// sea consistente sin depender del huso del que lo mire.
// Fecha de un registro: hoy, o un día pasado explícito. Una fecha futura o
// mal formada vuelve a hoy — no hay forma de adelantar el diario.
export function fechaDeRegistro(raw: string | null | undefined, ahora: Date = new Date()): string {
  const hoy = localDayString(ahora);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || raw > hoy) return hoy;
  return raw;
}

// Hoy se registra a la hora real. Un día pasado usa la hora sugerida del
// tiempo de comida, para que la cena olvidada no diga las 3 de la mañana.
export function horaParaRegistro(fecha: string, horaSugerida: string, ahora: Date = new Date()): Date {
  if (fecha === localDayString(ahora)) return ahora;
  const d = dateOnlyToLocalDate(fecha);
  const [hs, ms] = horaSugerida.split(":");
  const h = Number.parseInt(hs ?? "", 10);
  const m = Number.parseInt(ms ?? "", 10);
  if (Number.isFinite(h) && Number.isFinite(m)) d.setHours(h, m, 0, 0);
  return d;
}

export function dateOnlyToLocalDate(fecha: string | Date): Date {
  const iso = typeof fecha === "string" ? fecha : fecha.toISOString();
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
