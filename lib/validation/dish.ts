import { z } from "zod";

const componentSchema = z.object({
  id: z.string().uuid(),
  foodGroupId: z.string().min(1),
  foodItemId: z.string().nullish(),
  porciones: z.number().positive().max(40),
  notaLibre: z.string().max(160).nullish(),
  kcalPorPorcion: z.number().min(0).max(2000).nullish(),
  proteinaGPorPorcion: z.number().min(0).max(300).nullish(),
  carbosGPorPorcion: z.number().min(0).max(500).nullish(),
  grasaGPorPorcion: z.number().min(0).max(300).nullish(),
});

// Solo las comidas que el atleta eligió guardar. Los platillos del plan no
// pasan por aquí: si el id ya existe y no es suyo, la ruta responde 409.
export const userDishSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().trim().min(1).max(120),
  tipoComida: z.array(z.enum(["desayuno", "comida", "cena", "snack"])).min(1).max(4),
  archivadoEn: z.string().datetime().nullish(),
  actualizadoEn: z.string().datetime(),
  components: z.array(componentSchema).max(25),
}).superRefine((data, ctx) => {
  if (!data.archivadoEn && data.components.length === 0) {
    ctx.addIssue({ code: "custom", message: "sin_componentes", path: ["components"] });
  }
});

export type UserDishInput = z.infer<typeof userDishSchema>;
