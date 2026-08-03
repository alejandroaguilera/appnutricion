import { bucketNombreForClave } from "@/lib/nutrition/groups";
import type { Estimacion } from "@/lib/ai/schema";

// §6.7 / §7.4, de cumplimiento estricto en este canal:
// nunca reclamar, sin culpa, sin rachas rotas, sin ✗ rojos, sin caritas
// tristes. Un día fuera de objetivo se reporta como dato neutro. Un bot que
// regaña se silencia, y un bot silenciado no sirve.

const EMOJI_SLOT: Record<string, string> = {
  desayuno: "🍳",
  snack_am: "🍎",
  comida: "🍽️",
  snack_pm: "🥤",
  post_gym: "💪",
  cena: "🌙",
};

export function tarjetaEstimacion(args: {
  slotClave: string;
  slotNombre: string;
  estimacion: Estimacion;
  macros: { kcal: number; proteinaG: number; carbosG: number; grasaG: number };
}): string {
  const { estimacion, macros } = args;

  const lineas = estimacion.porciones
    .filter((p) => p.porciones > 0)
    .map((p) => {
      const etiqueta = bucketNombreForClave(p.grupo as never).padEnd(10, " ");
      const detalle = p.detalle ? `  <i>(${p.detalle})</i>` : "";
      return `${etiqueta} ${p.porciones.toFixed(1)}${detalle}`;
    });

  const titulo = estimacion.titulo ? ` — ${estimacion.titulo}` : "";
  const aviso =
    estimacion.confianza < 0.5
      ? "\n\n<i>No quedó muy claro. Revisa las cantidades antes de confirmar.</i>"
      : estimacion.confianza < 0.8
        ? "\n\n<i>Estimación aproximada, revisa las cantidades.</i>"
        : "";

  return (
    `${EMOJI_SLOT[args.slotClave] ?? "🍽️"} <b>${args.slotNombre}</b>${titulo}\n\n` +
    `<pre>${lineas.join("\n")}</pre>\n` +
    `≈ ${Math.round(macros.kcal)} kcal · P${Math.round(macros.proteinaG)} ` +
    `C${Math.round(macros.carbosG)} G${Math.round(macros.grasaG)}` +
    aviso
  );
}

export function acuseRegistro(barras: { nombre: string; actual: number; objetivo: number }[]): string {
  const resumen = barras
    .filter((b) => b.objetivo > 0)
    .map((b) => `${b.nombre.toLowerCase()} ${b.actual.toFixed(1)}/${b.objetivo}`)
    .join(", ");
  return `Registrado. Hoy llevas ${resumen}.`;
}

export function estadoDelDia(args: {
  titulo: string;
  barras: { nombre: string; actual: number; objetivo: number; esLibre: boolean }[];
  kcal: number;
  kcalObjetivo: number;
  proteinaG: number;
  proteinaObjetivo: number;
  nEntradas: number;
}): string {
  if (args.nEntradas === 0) return `<b>${args.titulo}</b>\n\nSin registros todavía.`;

  const lineas = args.barras.map((b) => {
    const objetivo = b.esLibre ? "libre" : b.objetivo.toString();
    return `${b.nombre.padEnd(10, " ")} ${b.actual.toFixed(1)} / ${objetivo}`;
  });

  return (
    `<b>${args.titulo}</b>\n\n<pre>${lineas.join("\n")}</pre>\n` +
    `${Math.round(args.kcal)} / ${Math.round(args.kcalObjetivo)} kcal · ` +
    `P ${Math.round(args.proteinaG)} / ${Math.round(args.proteinaObjetivo)} g\n` +
    `${args.nEntradas} ${args.nEntradas === 1 ? "registro" : "registros"}`
  );
}

export const AYUDA = `<b>Cómo registrar</b>

Escribe lo que comiste y ya: <i>"3 huevos, 2 tortillas y aguacate"</i>.
También puedes mandar una foto, con o sin descripción.

<b>Comandos</b>
/desayuno /comida /cena /snack + texto — registra en ese momento
/agua 500 — suma 500 ml
/peso 84.3 — registra el peso de hoy
/hoy — estado del día
/ayer — resumen de ayer
/semana — promedios y días registrados
/platillos — tus platillos guardados
/deshacer — quita el último registro
/ayuda — esto

Sin comando, la hora decide la comida.`;
