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

const itemSchema = z.object({
  nombre: z.string().max(60),
  cantidad: z.string().max(40).nullish(),
  grupo: z.enum(FOOD_GROUP_CLAVES),
  porciones: z.number().min(0).max(30),
});

const porcionSchema = z.object({
  grupo: z.enum(FOOD_GROUP_CLAVES),
  porciones: z.number().min(0).max(40),
  detalle: z.string().max(120).nullish(),
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

  // Si el modelo llenó `items` pero no `porciones`, se agrega localmente en
  // vez de rechazar una respuesta que en realidad traía la información.
  if (estimacion.porciones.length === 0 && estimacion.items.length > 0) {
    const porGrupo = new Map<FoodGroupClaveIa, { porciones: number; detalles: string[] }>();
    for (const item of estimacion.items) {
      const acc = porGrupo.get(item.grupo) ?? { porciones: 0, detalles: [] };
      acc.porciones += item.porciones;
      acc.detalles.push([item.nombre, item.cantidad].filter(Boolean).join(" "));
      porGrupo.set(item.grupo, acc);
    }
    estimacion.porciones = [...porGrupo.entries()].map(([grupo, v]) => ({
      grupo,
      porciones: v.porciones,
      detalle: v.detalles.join(", ").slice(0, 120),
    }));
  }

  return { ok: true, estimacion };
}
