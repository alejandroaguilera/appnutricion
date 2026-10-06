import { prisma } from "@/lib/prisma";
import { userDishSchema, type UserDishInput } from "@/lib/validation/dish";

const dishInclude = {
  components: {
    include: {
      foodGroup: { select: { clave: true } },
      foodItem: { select: { nombre: true, cantidadPorcion: true } },
    },
  },
} as const;

// Idempotente por id. `creadoPorUsuario` lo fuerza el servidor: un cliente no
// puede colar un platillo del plan ni editar uno que sembró la nutrióloga.
// La ruta rechaza ese caso con 409 antes de llegar aquí.
export async function upsertUserDish(input: UserDishInput) {
  const data = userDishSchema.parse(input);
  const actualizadoEn = new Date(data.actualizadoEn);

  const existing = await prisma.dish.findUnique({
    where: { id: data.id },
    select: { actualizadoEn: true, creadoPorUsuario: true },
  });

  if (existing && !existing.creadoPorUsuario) {
    return prisma.dish.findUniqueOrThrow({ where: { id: data.id }, include: dishInclude });
  }

  // Reenvío atrasado (el alta saliendo después del "quitar", o el beacon
  // compitiendo con el drenado). Gana el reloj más nuevo.
  if (existing && existing.actualizadoEn > actualizadoEn) {
    return prisma.dish.findUniqueOrThrow({ where: { id: data.id }, include: dishInclude });
  }

  return prisma.$transaction(async (tx) => {
    await tx.dish.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        nombre: data.nombre,
        tipoComida: data.tipoComida,
        creadoPorUsuario: true,
        actualizadoEn,
        archivadoEn: data.archivadoEn ? new Date(data.archivadoEn) : null,
      },
      update: {
        nombre: data.nombre,
        tipoComida: data.tipoComida,
        creadoPorUsuario: true,
        actualizadoEn,
        archivadoEn: data.archivadoEn ? new Date(data.archivadoEn) : null,
      },
    });

    await tx.dishComponent.deleteMany({ where: { dishId: data.id } });
    if (!data.archivadoEn && data.components.length > 0) {
      await tx.dishComponent.createMany({
        data: data.components.map((c) => ({
          id: c.id,
          dishId: data.id,
          foodGroupId: c.foodGroupId,
          foodItemId: c.foodItemId ?? null,
          porciones: c.porciones,
          notaLibre: c.notaLibre ?? null,
          kcalPorPorcion: c.kcalPorPorcion ?? null,
          proteinaGPorPorcion: c.proteinaGPorPorcion ?? null,
          carbosGPorPorcion: c.carbosGPorPorcion ?? null,
          grasaGPorPorcion: c.grasaGPorPorcion ?? null,
        })),
      });
    }

    return tx.dish.findUniqueOrThrow({ where: { id: data.id }, include: dishInclude });
  });
}
