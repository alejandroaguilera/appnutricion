import type { PrismaClient } from "@prisma/client";
import { FOOD_ITEMS_BY_GROUP, parseGramos } from "@/lib/data/foodItems";
import { DISHES_BLOQUE_2, NOMBRES_BLOQUE_1, type RawDish } from "@/lib/data/dishes";
import {
  BATIDO_POST_GYM,
  DAILY_TARGETS_BLOQUE_3,
  DISHES_BLOQUE_3,
  PLAN_BLOQUE_3,
  SLOTS_BLOQUE_3,
} from "@/lib/data/bloque3";
import { ACTIVE_PLAN, DAILY_TARGETS, PLAN_ANTERIOR, SLOTS } from "@/lib/data/plan";
import { REPRESENTATIVE_CLAVE } from "@/lib/nutrition/groups";
import { normalize } from "@/lib/text";

export interface FixupsResult {
  gramosBackfilled: number;
  bloque2: Bloque2Result;
  bloque3: Bloque3Result;
  pesos: PesosResult;
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

  // El orden importa: el Bloque 3 cierra la vigencia del plan que encuentre
  // activo, así que el Bloque 2 tiene que haberse aplicado antes.
  const bloque2 = await ensureBloque2(prisma);
  const bloque3 = await ensureBloque3(prisma);
  const pesos = await ensurePesosExtra(prisma);

  return { gramosBackfilled, bloque2, bloque3, pesos };
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
    //
    // Solo mientras no exista un plan posterior. Sin esta guarda, en cuanto
    // otro bloque desactivara éste, el siguiente arranque lo reactivaría y
    // desactivaría al nuevo — y así en cada boot.
    const posterior = await prisma.nutritionPlan.findFirst({
      where: { vigenteDesde: { gt: plan.vigenteDesde } },
      select: { id: true },
    });
    if (!plan.activo && !posterior) {
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

export interface Bloque3Result {
  platillosCreados: number;
  platillosArchivados: number;
  planCreado: boolean;
  planActivado: boolean;
  error: string | null;
}

// Plan 02 de Alma Lomeli (lib/data/bloque3.ts). Mismas dos reglas que el
// Bloque 2 —idempotente y no relanza—, más una que el Bloque 2 no tenía:
//
//  - **No pisa un plan posterior.** La activación y el archivado de los
//    platillos viejos solo ocurren mientras el Bloque 3 sea el plan más nuevo.
//    Sin eso, cuando llegue un Bloque 4, este fixup archivaría sus platillos
//    (no son del Bloque 3) en cada arranque.
//
// El plan, sus metas, sus slots y el cambio de plan activo van en UNA
// transacción: un plan a medio crear (sin slots) sería el activo y nadie
// volvería a completarlo, porque la próxima vez ya existiría por nombre.
async function ensureBloque3(prisma: PrismaClient): Promise<Bloque3Result> {
  const result: Bloque3Result = {
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

    const itemIdPorNombre = new Map(
      (await prisma.foodItem.findMany({ select: { id: true, nombre: true } })).map((i) => [
        normalize(i.nombre),
        i.id,
      ])
    );

    const platillos: RawDish[] = [...DISHES_BLOQUE_3, BATIDO_POST_GYM];

    // ── 1. Validar ANTES de escribir nada ────────────────────────────────
    // Un FoodItem mal escrito debe dejar todo como estaba, no un Bloque 3
    // activo con la mitad de sus platillos.
    for (const dish of platillos) {
      for (const c of dish.componentes) {
        if (c.foodItemNombre && !itemIdPorNombre.has(normalize(c.foodItemNombre))) {
          throw new Error(`FoodItem no encontrado para "${dish.nombre}": ${c.foodItemNombre}`);
        }
      }
    }

    // ── 2. Platillos (consulta antes de insertar: sin @unique en nombre) ─
    const nombresExistentes = new Set(
      (await prisma.dish.findMany({ select: { nombre: true } })).map((d) => normalize(d.nombre))
    );
    for (const dish of platillos) {
      if (nombresExistentes.has(normalize(dish.nombre))) continue;
      await prisma.dish.create({
        data: {
          nombre: dish.nombre,
          alias: dish.alias ?? [],
          tipoComida: dish.tipoComida,
          descripcion: dish.descripcion ?? null,
          components: {
            create: dish.componentes.map((c) => ({
              foodGroupId: idDeGrupo(c.foodGroupClave),
              foodItemId: c.foodItemNombre ? (itemIdPorNombre.get(normalize(c.foodItemNombre)) ?? null) : null,
              porciones: c.porciones,
              notaLibre: c.notaLibre ?? null,
            })),
          },
        },
      });
      result.platillosCreados++;
    }

    // ── 3. Plan, metas, slots y cambio de plan activo ────────────────────
    const vigenteDesde = new Date(`${PLAN_BLOQUE_3.vigenteDesde}T00:00:00.000Z`);
    const posterior = await prisma.nutritionPlan.findFirst({
      where: { vigenteDesde: { gt: vigenteDesde } },
      select: { id: true },
    });

    let plan = await prisma.nutritionPlan.findFirst({ where: { nombre: PLAN_BLOQUE_3.nombre } });

    if (!plan && !posterior) {
      plan = await prisma.$transaction(
        async (tx) => {
          const anterior = await tx.nutritionPlan.findFirst({
            where: { activo: true },
            include: { slots: { select: { clave: true, horaSugerida: true } } },
          });
          const horaAnterior = new Map((anterior?.slots ?? []).map((s) => [s.clave, s.horaSugerida]));

          await tx.nutritionPlan.updateMany({
            where: { activo: true },
            data: { activo: false },
          });
          if (anterior && !anterior.vigenteHasta) {
            await tx.nutritionPlan.update({
              where: { id: anterior.id },
              data: { vigenteHasta: new Date(`${PLAN_BLOQUE_3.vigenciaAnteriorHasta}T00:00:00.000Z`) },
            });
          }

          const creado = await tx.nutritionPlan.create({
            data: {
              nombre: PLAN_BLOQUE_3.nombre,
              vigenteDesde,
              activo: true,
              kcalObjetivo: PLAN_BLOQUE_3.kcalObjetivo,
              proteinaG: PLAN_BLOQUE_3.proteinaG,
              carbosG: PLAN_BLOQUE_3.carbosG,
              grasaG: PLAN_BLOQUE_3.grasaG,
              fibraG: anterior?.fibraG ?? PLAN_BLOQUE_3.fibraGRespaldo,
              aguaL: PLAN_BLOQUE_3.aguaL,
              notas: PLAN_BLOQUE_3.notas,
            },
          });

          await tx.planTargetByGroup.createMany({
            data: DAILY_TARGETS_BLOQUE_3.map((t) => ({
              nutritionPlanId: creado.id,
              foodGroupId: idDeGrupo(t.clave),
              porcionesDia: t.porcionesDia,
            })),
          });

          for (const slot of SLOTS_BLOQUE_3) {
            const s = await tx.planMealSlot.create({
              data: {
                nutritionPlanId: creado.id,
                clave: slot.clave,
                nombre: slot.nombre,
                orden: slot.orden,
                horaSugerida: horaAnterior.get(slot.clave) ?? slot.horaRespaldo,
                esOpcional: slot.esOpcional,
              },
            });

            // Solo metas mayores que cero: `post_gym` va sin metas, y todos
            // los consumidores filtran los ceros de todos modos.
            const porGrupo: [string, number][] = [
              [REPRESENTATIVE_CLAVE.proteina, slot.targets.proteina],
              ["cereal", slot.targets.cereal],
              [REPRESENTATIVE_CLAVE.grasa, slot.targets.grasa],
              ["fruta", slot.targets.fruta],
              ["verdura", slot.targets.verdura],
              ["leguminosa", slot.targets.leguminosa],
            ];
            const metas = porGrupo.filter(([, porciones]) => porciones > 0);
            if (metas.length > 0) {
              await tx.planMealSlotTarget.createMany({
                data: metas.map(([clave, porciones]) => ({
                  planMealSlotId: s.id,
                  foodGroupId: idDeGrupo(clave),
                  porciones,
                })),
              });
            }
          }

          return creado;
        },
        { timeout: 30_000 }
      );
      result.planCreado = true;
      result.planActivado = true;
    }

    if (!plan || posterior) return result;

    // Recuperación: existe pero alguien lo dejó inactivo sin que haya un plan
    // más nuevo. Mismo intercambio atómico que el Bloque 2.
    if (!plan.activo) {
      const planId = plan.id;
      await prisma.$transaction([
        prisma.nutritionPlan.updateMany({ where: { id: { not: planId }, activo: true }, data: { activo: false } }),
        prisma.nutritionPlan.update({ where: { id: planId }, data: { activo: true } }),
      ]);
      result.planActivado = true;
    }

    // ── 4. Archivar todo platillo que no sea del Bloque 3 ────────────────
    // Borrado lógico (§5.4.4): "Registrar" solo ofrece el plan vigente, el
    // historial sigue leyendo los viejos y es reversible. Las comidas ya
    // registradas no cambian: sus macros están congelados.
    const archivados = await prisma.dish.updateMany({
      where: { archivadoEn: null, nombre: { notIn: platillos.map((d) => d.nombre) } },
      data: { archivadoEn: new Date() },
    });
    result.platillosArchivados = archivados.count;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    console.error("[fixups] El Bloque 3 no se pudo aplicar completo:", e);
  }

  return result;
}

export interface PesosResult {
  recibidos: number;
  creados: number;
  error: string | null;
}

// Pesos de la báscula que no llegan por ningún otro canal mientras no exista
// la sincronización con appgym (fase 8). Los datos de salud NO van al repo
// (es público; ver .gitignore): llegan por la variable de entorno
// PESOS_EXTRA_BASE64 = base64 de `[{"fecha":"YYYY-MM-DD","pesoKg":84.3}, …]`,
// igual que el histórico de WEIGHT_CSV_BASE64.
//
// `fuente = manual`, mismo criterio que el histórico de enero a julio. Una
// fecha que ya tenga peso manual no se toca (`skipDuplicates` sobre
// `@@unique([fecha, fuente])`), así que correrlo en cada arranque no cambia
// nada después de la primera vez.
async function ensurePesosExtra(prisma: PrismaClient): Promise<PesosResult> {
  const result: PesosResult = { recibidos: 0, creados: 0, error: null };
  const crudo = process.env.PESOS_EXTRA_BASE64?.trim();
  if (!crudo) return result;

  try {
    const lista: unknown = JSON.parse(Buffer.from(crudo, "base64").toString("utf-8"));
    if (!Array.isArray(lista)) throw new Error("PESOS_EXTRA_BASE64 no es un arreglo");

    const filas = lista.map((x, i) => {
      const { fecha, pesoKg } = (x ?? {}) as { fecha?: unknown; pesoKg?: unknown };
      if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        throw new Error(`fila ${i}: fecha inválida`);
      }
      if (typeof pesoKg !== "number" || !(pesoKg > 20 && pesoKg < 300)) {
        throw new Error(`fila ${i}: pesoKg inválido`);
      }
      return { fecha: new Date(`${fecha}T00:00:00.000Z`), pesoKg, fuente: "manual" as const };
    });
    result.recibidos = filas.length;

    const res = await prisma.weightEntry.createMany({ data: filas, skipDuplicates: true });
    result.creados = res.count;
  } catch (e) {
    // Nunca se escribe el contenido en el log: son datos de salud.
    result.error = e instanceof Error ? e.message : String(e);
    console.error("[fixups] PESOS_EXTRA_BASE64 no se pudo cargar:", result.error);
  }

  return result;
}
