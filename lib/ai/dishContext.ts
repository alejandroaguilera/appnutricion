import { prisma } from "@/lib/prisma";
import type { DishMatchContext } from "./localMatch";

// Los 20 platillos más usados del atleta (§3.2-D paso 4). Se le pasan al
// modelo como contexto para que prefiera identificar uno existente antes que
// estimar desde cero, y sirven además para el emparejamiento local que evita
// llamar al modelo del todo.
const dishInclude = {
  components: {
    include: {
      foodGroup: { select: { clave: true } },
      foodItem: { select: { nombre: true, cantidadPorcion: true } },
    },
  },
} as const;

export async function loadDishContext(limite = 20): Promise<DishMatchContext[]> {
  // La mitad del cupo queda para lo que el atleta guardó, aunque tenga 0 usos.
  // Si no, los 17 platillos del plan —más usados— empujan fuera del contexto
  // justo la comida que quería poder repetir por nombre.
  const cupoPropio = Math.ceil(limite / 2);
  const [propios, delPlan] = await Promise.all([
    prisma.dish.findMany({
      where: { archivadoEn: null, creadoPorUsuario: true },
      orderBy: [{ vecesUsado: "desc" }, { nombre: "asc" }],
      take: cupoPropio,
      include: dishInclude,
    }),
    prisma.dish.findMany({
      where: { archivadoEn: null, creadoPorUsuario: false },
      orderBy: [{ vecesUsado: "desc" }, { nombre: "asc" }],
      take: limite,
      include: dishInclude,
    }),
  ]);

  const vistos = new Set(propios.map((d) => d.id));
  const dishes = [...propios, ...delPlan.filter((d) => !vistos.has(d.id))].slice(0, limite);

  return dishes.map((d) => ({
    id: d.id,
    nombre: d.nombre,
    alias: d.alias,
    vecesUsado: d.vecesUsado,
    tipoComida: d.tipoComida,
    components: d.components.map((c) => ({
      foodGroupId: c.foodGroupId,
      foodGroupClave: c.foodGroup.clave,
      foodItemId: c.foodItemId,
      foodItemNombre: c.foodItem?.nombre ?? c.notaLibre ?? null,
      porciones: c.porciones,
      // `notaLibre` aparte y no solo como respaldo del nombre: es donde viven
      // los gramos reales del menú de la nutrióloga ("138 g cocida", "180 g"),
      // y se perdían en cuanto el componente tenía un FoodItem asociado.
      notaLibre: c.notaLibre,
      cantidadPorcion: c.foodItem?.cantidadPorcion ?? null,
      kcalPorPorcion: c.kcalPorPorcion,
      proteinaGPorPorcion: c.proteinaGPorPorcion,
      carbosGPorPorcion: c.carbosGPorPorcion,
      grasaGPorPorcion: c.grasaGPorPorcion,
    })),
  }));
}
