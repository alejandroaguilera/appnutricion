import type { PlanMealSlotClave } from "@prisma/client";
import { APP_TIME_ZONE } from "@/lib/date";

// Mismos rangos horarios que definirá el canal Telegram (§6.5) — se reusan
// aquí para resaltar el slot "actual" en la pantalla Hoy, aunque el registro
// siempre lo decide el usuario tocando la tarjeta del slot que quiera.
export function currentSlotForTime(date: Date = new Date(), timeZone: string = APP_TIME_ZONE): PlanMealSlotClave {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(date)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {} as Record<string, string>);
  const minutesOfDay = Number(parts.hour) * 60 + Number(parts.minute);

  if (minutesOfDay < 11 * 60) return "desayuno";
  if (minutesOfDay < 13 * 60) return "snack_am";
  if (minutesOfDay < 16 * 60 + 30) return "comida";
  if (minutesOfDay < 19 * 60) return "snack_pm";
  return "cena";
}
