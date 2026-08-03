import { z } from "zod";

export const dayLogSchema = z.object({
  id: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pesoCorporalKg: z.number().nullable(),
  aguaMl: z.number().int().nullable(),
  notas: z.string().nullable(),
  animo1a5: z.number().int().min(1).max(5).nullable(),
  hambre1a5: z.number().int().min(1).max(5).nullable(),
  cerradoEn: z.string().datetime().nullable(),
});

export type DayLogInput = z.infer<typeof dayLogSchema>;
