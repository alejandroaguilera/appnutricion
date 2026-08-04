import type { PrismaClient } from "@prisma/client";
import { parseGramos } from "@/lib/data/foodItems";

export interface FixupsResult {
  gramosBackfilled: number;
}

// Correcciones de datos sobre filas que YA existen.
//
// `seedDatabase` corta de inmediato si ya hay catálogo sembrado, así que nada
// puesto ahí adentro vuelve a correr jamás: mejorar el parser de gramos no
// tenía ningún efecto en producción porque `cantidadGramos` solo se escribe al
// crear el ítem. Esto va aparte y corre en cada arranque.
//
// Todo aquí tiene que ser idempotente y barato: se ejecuta en cada boot del
// contenedor, sin supervisión y sin posibilidad de entrar a arreglarlo a mano.
export async function applyDataFixups(prisma: PrismaClient): Promise<FixupsResult> {
  let gramosBackfilled = 0;

  // Rellena `cantidadGramos` donde el parser ampliado ahora sí sabe leerlo
  // ("80-90 g", "1/3 taza (80 g)"). Solo toca filas con el campo en null, así
  // que un ítem corregido a mano no se pisa.
  const sinGramos = await prisma.foodItem.findMany({
    where: { cantidadGramos: null },
    select: { id: true, cantidadPorcion: true },
  });

  for (const item of sinGramos) {
    const gramos = parseGramos(item.cantidadPorcion);
    if (gramos === null) continue;
    await prisma.foodItem.update({ where: { id: item.id }, data: { cantidadGramos: gramos } });
    gramosBackfilled++;
  }

  return { gramosBackfilled };
}
