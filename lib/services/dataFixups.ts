import type { PrismaClient } from "@prisma/client";
import { FOOD_ITEMS_BY_GROUP, parseGramos } from "@/lib/data/foodItems";
import { DISHES_BLOQUE_2, NOMBRES_BLOQUE_1 } from "@/lib/data/dishes";
import { ACTIVE_PLAN, DAILY_TARGETS, PLAN_ANTERIOR, SLOTS } from "@/lib/data/plan";
import { REPRESENTATIVE_CLAVE } from "@/lib/nutrition/groups";
import { normalize } from "@/lib/text";

export interface FixupsResult {
  gramosBackfilled: number;
  bloque2: Bloque2Result;
}

export interface Bloque2Result {
  itemsCreados: number;
  platillosCreados: number;
  platillosArchivados: number;
  planCreado: boolean;
  planActivado: boolean;
  error: string | null;
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

  return { gramosBackfilled, bloque2: await ensureBloque2(prisma) };
}

// Migración del plan vigente al Bloque 2 (menú de Alma Lomeli, 2026-08-10)
// sobre una base ya sembrada con el Bloque 1.
//
// No hay ruta HTTP que escriba catálogo ni plan, ni `docker exec`, ni shell en
// el contenedor: este es el único camino que corre contra la base de
// producción. De ahí las dos propiedades que no son negociables aquí:
//
//  - **Idempotente.** Corre en cada boot. `Dish.nombre` y `FoodItem.nombre` no
//    tienen `@unique`, así que insertar sin consultar antes duplicaría filas en
//    silencio, una copia por arranque.
//  - **No relanza.** `prisma/seed.ts` corre encadenado con `&&` antes de
//    `node server.js` (Dockerfile). Un throw aquí deja la app sin arrancar y
//    sin forma de entrar a repararla. Que el plan no se actualice es un
//    problema; que el contenedor no levante es otro mucho peor.
async function ensureBloque2(prisma: PrismaClient): Promise<Bloque2Result> {
  const result: Bloque2Result = {
    itemsCreados: 0,
    platillosCreados: 0,
    platillosArchivados: 0,
    planCreado: false,
    planActivado: false,
    error: null,
  };

  try {
    const grupos = await prisma.foodGroup.findMany({ select: { id: true, clave: true } });
    if (grupos.length === 0) return result; // base recién creada: siembra `seedDatabase`
    const groupIdByClave = new Map(grupos.map((g) => [g.clave as string, g.id]));

    const idDeGrupo = (clave: string): string => {
      const id = groupIdByClave.get(clave);
      if (!id) throw new Error(`FoodGroup no encontrado: ${clave}`);
      return id;
    };

    // ── 1. FoodItem faltantes ────────────────────────────────────────────
    // El catálogo se compara por nombre normalizado, la misma regla que usa
    // el emparejamiento local de platillos (lib/text.ts).
    const itemsExistentes = await prisma.foodItem.findMany({ select: { id: true, nombre: true } });
    const itemIdPorNombre = new Map(itemsExistentes.map((i) => [normalize(i.nombre), i.id]));

    for (const [clave, items] of Object.entries(FOOD_ITEMS_BY_GROUP)) {
      for (const item of items) {
        if (itemIdPorNombre.has(normalize(item.nombre))) continue;
        const creado = await prisma.foodItem.create({
          data: {
            foodGroupId: idDeGrupo(clave),
            nombre: item.nombre,
            cantidadPorcion: item.cantidadPorcion,
            cantidadGramos: parseGramos(item.cantidadPorcion),
            archivadoEn: item.archivado ? new Date() : null,
          },
        });
        itemIdPorNombre.set(normalize(item.nombre), creado.id);
        result.itemsCreados++;
      }
    }

    // ── 2. Platillos del Bloque 2 ────────────────────────────────────────
    const nombresExistentes = new Set(
      (await prisma.dish.findMany({ select: { nombre: true } })).map((d) => normalize(d.nombre))
    );

    for (const dish of DISHES_BLOQUE_2) {
      if (nombresExistentes.has(normalize(dish.nombre))) continue;
      await prisma.dish.create({
        data: {
          nombre: dish.nombre,
          alias: dish.alias ?? [],
          tipoComida: dish.tipoComida,
          archivadoEn: dish.archivado ? new Date() : null,
          components: {
            create: dish.componentes.map((c) => {
              const foodItemId = c.foodItemNombre
                ? itemIdPorNombre.get(normalize(c.foodItemNombre))
                : undefined;
              if (c.foodItemNombre && !foodItemId) {
                throw new Error(`FoodItem no encontrado para "${dish.nombre}": ${c.foodItemNombre}`);
              }
              return {
                foodGroupId: idDeGrupo(c.foodGroupClave),
                foodItemId: foodItemId ?? null,
                porciones: c.porciones,
                notaLibre: c.notaLibre ?? null,
              };
            }),
          },
        },
      });
      result.platillosCreados++;
    }

    // ── 3. Archivar los platillos del Bloque 1 ───────────────────────────
    // Borrado lógico (§5.4.4): salen de la interfaz de registro, siguen en la
    // base y el historial que apunta a ellos se sigue leyendo.
    const archivados = await prisma.dish.updateMany({
      where: { nombre: { in: NOMBRES_BLOQUE_1 }, archivadoEn: null },
      data: { archivadoEn: new Date() },
    });
    result.platillosArchivados = archivados.count;

    // ── 4. NutritionPlan del Bloque 2 ────────────────────────────────────
    let plan = await prisma.nutritionPlan.findFirst({ where: { nombre: ACTIVE_PLAN.nombre } });
    if (!plan) {
      plan = await prisma.nutritionPlan.create({
        data: {
          nombre: ACTIVE_PLAN.nombre,
          vigenteDesde: new Date(ACTIVE_PLAN.vigenteDesde),
          activo: false, // se activa en el paso 5, junto con el cierre del anterior
          kcalObjetivo: ACTIVE_PLAN.kcalObjetivo,
          proteinaG: ACTIVE_PLAN.proteinaG,
          carbosG: ACTIVE_PLAN.carbosG,
          grasaG: ACTIVE_PLAN.grasaG,
          fibraG: ACTIVE_PLAN.fibraG,
          aguaL: ACTIVE_PLAN.aguaL,
          notas: ACTIVE_PLAN.notas,
        },
      });
      result.planCreado = true;

      for (const target of DAILY_TARGETS) {
        await prisma.planTargetByGroup.create({
          data: {
            nutritionPlanId: plan.id,
            foodGroupId: idDeGrupo(target.clave),
            porcionesDia: target.porcionesDia,
          },
        });
      }

      for (const slot of SLOTS) {
        const creado = await prisma.planMealSlot.create({
          data: {
            nutritionPlanId: plan.id,
            clave: slot.clave,
            nombre: slot.nombre,
            orden: slot.orden,
            horaSugerida: slot.horaSugerida,
            esOpcional: slot.esOpcional,
          },
        });

        const porGrupo: [string, number | null][] = [
          [REPRESENTATIVE_CLAVE.proteina, slot.targets.proteina],
          ["cereal", slot.targets.cereal],
          [REPRESENTATIVE_CLAVE.grasa, slot.targets.grasa],
          ["fruta", slot.targets.fruta],
          ["verdura", slot.targets.verdura],
        ];
        for (const [clave, porciones] of porGrupo) {
          if (porciones === null) continue; // sin target explícito ≠ cero
          await prisma.planMealSlotTarget.create({
            data: { planMealSlotId: creado.id, foodGroupId: idDeGrupo(clave), porciones },
          });
        }
      }
    }

    // ── 5. Cambio de plan vigente ────────────────────────────────────────
    // `NutritionPlan.activo` no es único y `/api/plan` resuelve con
    // `findFirst` sin `orderBy`: si los dos quedaran activos, cuál gana sería
    // cuestión de suerte. Los dos updates van en la misma transacción.
    if (!plan.activo) {
      const planId = plan.id;
      await prisma.$transaction([
        prisma.nutritionPlan.updateMany({
          where: { nombre: PLAN_ANTERIOR.nombre },
          data: { activo: false, vigenteHasta: new Date(PLAN_ANTERIOR.vigenteHasta) },
        }),
        prisma.nutritionPlan.updateMany({
          where: { id: { not: planId }, activo: true },
          data: { activo: false },
        }),
        prisma.nutritionPlan.update({ where: { id: planId }, data: { activo: true } }),
      ]);
      result.planActivado = true;
    }
  } catch (e) {
    // Se registra y se sigue: ver la nota de arriba sobre por qué no relanza.
    result.error = e instanceof Error ? e.message : String(e);
    console.error("[fixups] El Bloque 2 no se pudo aplicar completo:", e);
  }

  return result;
}
