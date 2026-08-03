import { prisma } from "@/lib/prisma";
import type { DishMatchContext } from "./localMatch";

// Los 20 platillos más usados del atleta (§3.2-D paso 4). Se le pasan al
// modelo como contexto para que prefiera identificar uno existente antes que
// estimar desde cero, y sirven además para el emparejamiento local que evita
// llamar al modelo del todo.
export async function loadDishContext(limite = 20): Promise<DishMatchContext[]> {
  const dishes = await prisma.dish.findMany({
    where: { archivadoEn: null },
    orderBy: [{ vecesUsado: "desc" }, { nombre: "asc" }],
    take: limite,
    include: {
      components: {
        include: {
          foodGroup: { select: { clave: true } },
          foodItem: { select: { nombre: true } },
        },
      },
    },
  });

  return dishes.map((d) => ({
    id: d.id,
    nombre: d.nombre,
    alias: d.alias,
    vecesUsado: d.vecesUsado,
    components: d.components.map((c) => ({
      foodGroupId: c.foodGroupId,
      foodGroupClave: c.foodGroup.clave,
      foodItemId: c.foodItemId,
      foodItemNombre: c.foodItem?.nombre ?? c.notaLibre ?? null,
      porciones: c.porciones,
    })),
  }));
}
