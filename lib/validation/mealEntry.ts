import { z } from "zod";

const portionSchema = z.object({
  id: z.string().uuid(),
  foodGroupId: z.string(),
  foodItemId: z.string().nullable(),
  // Nombre y cantidad legibles del ítem. `nullish` para que un cliente que
  // todavía no los manda siga validando.
  nombre: z.string().max(120).nullish(),
  cantidad: z.string().max(60).nullish(),
  orden: z.number().int().nullish(),
  porciones: z.number(),
  kcal: z.number(),
  proteinaG: z.number(),
  carbosG: z.number(),
  grasaG: z.number(),
});

export const mealEntrySchema = z.object({
  id: z.string().uuid(),
  dayLogId: z.string().uuid(),
  // Clave natural del día padre. El servidor resuelve/crea el DayLog a partir
  // de ella, así que un PUT de comida ya no depende de que el PUT del día
  // haya llegado antes — es lo que desatora una cola detenida a media fila.
  // `nullish` por compatibilidad con clientes viejos que aún no la mandan.
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  planMealSlotId: z.string().nullable(),
  clave: z.enum(["desayuno", "snack_am", "comida", "snack_pm", "post_gym", "cena"]),
  horaRegistro: z.string().datetime(),
  dishId: z.string().nullable(),
  textoLibre: z.string().nullable(),
  fueraDeCasa: z.boolean(),
  notas: z.string().nullable(),
  version: z.number().int(),
  origen: z.enum(["app", "telegram", "import"]).default("app"),
  titulo: z.string().max(120).nullish(),
  estadoClasificacion: z.enum(["clasificado", "pendiente", "fallido"]).nullish(),
  confianzaIa: z.number().min(0).max(1).nullish(),
  modeloIa: z.string().max(80).nullish(),
  fotoPrincipalId: z.string().nullish(),
  estimacionIa: z.unknown().nullish(),
  portions: z.array(portionSchema),
});

export type MealEntryInput = z.infer<typeof mealEntrySchema>;
