import { z } from "zod";

export const FOOD_GROUP_CLAVES = [
  "verdura",
  "fruta",
  "cereal",
  "leguminosa",
  "aoa_muy_bajo",
  "aoa_bajo",
  "aoa_moderado",
  "grasa_sin_proteina",
  "grasa_con_proteina",
  "leche",
  "libre",
] as const;

export type FoodGroupClaveIa = (typeof FOOD_GROUP_CLAVES)[number];

// Macros declaradas por el modelo, admitidas SOLO para el grupo `libre`
// (alcohol, refrescos, productos de marca — lo que el SMAE no cubre). Son por
// UNA porción del ítem, no por el total. `.nullish()` y no `.nullable()`: un
// campo omitido no debe costar un dato.
const macrosPropias = {
  kcal: z.number().min(0).max(2000).nullish(),
  proteinaG: z.number().min(0).max(300).nullish(),
  carbosG: z.number().min(0).max(500).nullish(),
  grasaG: z.number().min(0).max(300).nullish(),
};

const itemSchema = z.object({
  nombre: z.string().max(60),
  cantidad: z.string().max(40).nullish(),
  grupo: z.enum(FOOD_GROUP_CLAVES),
  porciones: z.number().min(0).max(30),
  ...macrosPropias,
});

const porcionSchema = z.object({
  grupo: z.enum(FOOD_GROUP_CLAVES),
  porciones: z.number().min(0).max(40),
  detalle: z.string().max(120).nullish(),
  ...macrosPropias,
});

export const estimacionSchema = z.object({
  titulo: z.string().max(60).nullish(),
  platilloCoincidente: z.string().nullish(),
  items: z.array(itemSchema).max(25).default([]),
  porciones: z.array(porcionSchema).max(15).default([]),
  confianza: z.number().min(0).max(1),
  notas: z.string().max(300).nullish(),
});

export type Estimacion = z.infer<typeof estimacionSchema>;

// Los modelos envuelven el JSON en cercas de código con bastante frecuencia,
// incluso pidiendo response_format json_object.
function limpiar(texto: string): string {
  const t = texto.trim();
  const cerca = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (cerca) return cerca[1].trim();
  const inicio = t.indexOf("{");
  const fin = t.lastIndexOf("}");
  if (inicio !== -1 && fin > inicio) return t.slice(inicio, fin + 1);
  return t;
}

export interface ParseResultado {
  ok: true;
  estimacion: Estimacion;
}
export interface ParseFallo {
  ok: false;
  issues: string;
}

export function parseEstimacion(texto: string): ParseResultado | ParseFallo {
  let json: unknown;
  try {
    json = JSON.parse(limpiar(texto));
  } catch {
    return { ok: false, issues: "la respuesta no es JSON válido" };
  }

  const res = estimacionSchema.safeParse(json);
  if (!res.success) {
    return { ok: false, issues: JSON.stringify(res.error.issues.slice(0, 6)) };
  }

  const estimacion = res.data;

  // El SMAE es la única fuente de macros para sus diez grupos reales (§7.1).
  // Si el modelo los manda igual, se tiran aquí y no río abajo: la regla vive
  // en código, no solo en el prompt.
  for (const fila of [...estimacion.items, ...estimacion.porciones]) {
    if (fila.grupo !== "libre") {
      fila.kcal = null;
      fila.proteinaG = null;
      fila.carbosG = null;
      fila.grasaG = null;
    }
  }

  // Si el modelo llenó `items` pero no `porciones`, se agrega localmente en
  // vez de rechazar una respuesta que en realidad traía la información.
  if (estimacion.porciones.length === 0 && estimacion.items.length > 0) {
    const porGrupo = new Map<
      FoodGroupClaveIa,
      { porciones: number; detalles: string[]; kcal: number; proteinaG: number; carbosG: number; grasaG: number }
    >();
    for (const item of estimacion.items) {
      const acc =
        porGrupo.get(item.grupo) ??
        { porciones: 0, detalles: [], kcal: 0, proteinaG: 0, carbosG: 0, grasaG: 0 };
      acc.porciones += item.porciones;
      acc.detalles.push([item.nombre, item.cantidad].filter(Boolean).join(" "));
      // Las macros propias van por porción; al agregar varios ítems `libre` en
      // una sola fila hay que sumar TOTALES y volver a dividir, o dos cervezas
      // distintas se promediarían mal.
      acc.kcal += (item.kcal ?? 0) * item.porciones;
      acc.proteinaG += (item.proteinaG ?? 0) * item.porciones;
      acc.carbosG += (item.carbosG ?? 0) * item.porciones;
      acc.grasaG += (item.grasaG ?? 0) * item.porciones;
      porGrupo.set(item.grupo, acc);
    }
    estimacion.porciones = [...porGrupo.entries()].map(([grupo, v]) => ({
      grupo,
      porciones: v.porciones,
      detalle: v.detalles.join(", ").slice(0, 120),
      kcal: v.porciones > 0 ? v.kcal / v.porciones : null,
      proteinaG: v.porciones > 0 ? v.proteinaG / v.porciones : null,
      carbosG: v.porciones > 0 ? v.carbosG / v.porciones : null,
      grasaG: v.porciones > 0 ? v.grasaG / v.porciones : null,
    }));
  }

  // Y al revés. El modelo omite `items` con bastante frecuencia cuando mira una
  // foto, y `ConfirmarEstimacion` arma la tarjeta SOLO desde `items`: una
  // respuesta que traía el agregado completo se veía como una tarjeta vacía de
  // 0 kcal con el botón Confirmar apagado. Telegram y la reclasificación ya
  // tenían este respaldo cada uno por su cuenta; ahora está en el único lugar
  // por el que pasan los cuatro consumidores.
  if (estimacion.items.length === 0 && estimacion.porciones.length > 0) {
    estimacion.items = estimacion.porciones.map((p) => ({
      nombre: (p.detalle ?? p.grupo).slice(0, 60),
      cantidad: null,
      grupo: p.grupo,
      porciones: p.porciones,
      kcal: p.kcal ?? null,
      proteinaG: p.proteinaG ?? null,
      carbosG: p.carbosG ?? null,
      grasaG: p.grasaG ?? null,
    }));
  }

  return { ok: true, estimacion };
}
