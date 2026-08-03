import type { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { FOOD_GROUPS, REPRESENTATIVE_CLAVE } from "@/lib/nutrition/groups";
import { FOOD_ITEMS_BY_GROUP, parseGramos } from "@/lib/data/foodItems";
import { DISHES } from "@/lib/data/dishes";
import { ACTIVE_PLAN, DAILY_TARGETS, SLOTS } from "@/lib/data/plan";
import { parseWeightCsv } from "@/lib/services/parseWeightCsv";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export interface SeedResult {
  skipped: boolean;
  foodGroupsCreated: number;
  foodItemsCreated: number;
  dishesCreated: number;
  weightEntriesCreated: number;
}

// Idempotente: no hace nada si ya hay FoodGroup sembrados. Usa
// `prisma migrate reset` para reiniciar (mismo patrón que appgym).
export async function seedDatabase(prisma: PrismaClient): Promise<SeedResult> {
  const existingGroups = await prisma.foodGroup.count();
  if (existingGroups > 0) {
    return { skipped: true, foodGroupsCreated: 0, foodItemsCreated: 0, dishesCreated: 0, weightEntriesCreated: 0 };
  }

  await prisma.user.upsert({
    where: { email: "yo@alejandroaguilera.mx" },
    create: { email: "yo@alejandroaguilera.mx", nombre: "Alejandro", zonaHoraria: "America/Matamoros" },
    update: {},
  });

  // ── 1. FoodGroup ─────────────────────────────────────────────────────
  const groupIdByClave = new Map<string, string>();
  for (const g of FOOD_GROUPS) {
    const created = await prisma.foodGroup.create({ data: g });
    groupIdByClave.set(g.clave, created.id);
  }

  // ── 2. FoodItem (§10.2) ──────────────────────────────────────────────
  const itemByName = new Map<string, { id: string; foodGroupClave: string }>();
  let foodItemsCreated = 0;
  const archivedAt = new Date();
  for (const [clave, items] of Object.entries(FOOD_ITEMS_BY_GROUP)) {
    const foodGroupId = groupIdByClave.get(clave);
    if (!foodGroupId) throw new Error(`FoodGroup no encontrado: ${clave}`);
    for (const item of items) {
      const created = await prisma.foodItem.create({
        data: {
          foodGroupId,
          nombre: item.nombre,
          cantidadPorcion: item.cantidadPorcion,
          cantidadGramos: parseGramos(item.cantidadPorcion),
          archivadoEn: item.archivado ? archivedAt : null,
        },
      });
      itemByName.set(normalize(item.nombre), { id: created.id, foodGroupClave: clave });
      foodItemsCreated++;
    }
  }

  // ── 3. Dish + DishComponent (§10.3) ──────────────────────────────────
  let dishesCreated = 0;
  for (const dish of DISHES) {
    await prisma.dish.create({
      data: {
        nombre: dish.nombre,
        alias: dish.alias ?? [],
        tipoComida: dish.tipoComida,
        components: {
          create: dish.componentes.map((c) => {
            const foodGroupId = groupIdByClave.get(c.foodGroupClave);
            if (!foodGroupId) throw new Error(`FoodGroup no encontrado: ${c.foodGroupClave}`);
            const foodItem = c.foodItemNombre ? itemByName.get(normalize(c.foodItemNombre)) : undefined;
            if (c.foodItemNombre && !foodItem) {
              throw new Error(`FoodItem no encontrado para el platillo "${dish.nombre}": ${c.foodItemNombre}`);
            }
            return {
              foodGroupId,
              foodItemId: foodItem?.id ?? null,
              porciones: c.porciones,
              notaLibre: c.notaLibre ?? null,
            };
          }),
        },
      },
    });
    dishesCreated++;
  }

  // ── 4. NutritionPlan + targets + slots (§10.1) ───────────────────────
  const plan = await prisma.nutritionPlan.create({
    data: {
      nombre: ACTIVE_PLAN.nombre,
      vigenteDesde: new Date(ACTIVE_PLAN.vigenteDesde),
      activo: ACTIVE_PLAN.activo,
      kcalObjetivo: ACTIVE_PLAN.kcalObjetivo,
      proteinaG: ACTIVE_PLAN.proteinaG,
      carbosG: ACTIVE_PLAN.carbosG,
      grasaG: ACTIVE_PLAN.grasaG,
      fibraG: ACTIVE_PLAN.fibraG,
      aguaL: ACTIVE_PLAN.aguaL,
    },
  });

  for (const target of DAILY_TARGETS) {
    const foodGroupId = groupIdByClave.get(target.clave);
    if (!foodGroupId) throw new Error(`FoodGroup no encontrado: ${target.clave}`);
    await prisma.planTargetByGroup.create({
      data: { nutritionPlanId: plan.id, foodGroupId, porcionesDia: target.porcionesDia },
    });
  }

  for (const slot of SLOTS) {
    const created = await prisma.planMealSlot.create({
      data: {
        nutritionPlanId: plan.id,
        clave: slot.clave,
        nombre: slot.nombre,
        orden: slot.orden,
        horaSugerida: slot.horaSugerida,
        esOpcional: slot.esOpcional,
      },
    });

    const targetsByClave: [string, number | null][] = [
      [REPRESENTATIVE_CLAVE.proteina, slot.targets.proteina],
      ["cereal", slot.targets.cereal],
      [REPRESENTATIVE_CLAVE.grasa, slot.targets.grasa],
      ["fruta", slot.targets.fruta],
      ["verdura", slot.targets.verdura],
    ];
    for (const [clave, porciones] of targetsByClave) {
      // null = sin target explícito para este slot; 0 sí se siembra (target real de cero).
      if (porciones === null) continue;
      const foodGroupId = groupIdByClave.get(clave);
      if (!foodGroupId) throw new Error(`FoodGroup no encontrado: ${clave}`);
      await prisma.planMealSlotTarget.create({
        data: { planMealSlotId: created.id, foodGroupId, porciones },
      });
    }
  }

  // ── 5. WeightEntry desde CSV histórico (§10.4) ───────────────────────
  const csvPath = process.env.WEIGHT_CSV_PATH ?? path.join(process.cwd(), "BodyComposition_202601-202607.csv");
  let weightEntriesCreated = 0;
  if (fs.existsSync(csvPath)) {
    const csvText = fs.readFileSync(csvPath, "utf-8");
    const rows = parseWeightCsv(csvText);
    const result = await prisma.weightEntry.createMany({
      data: rows.map((r) => ({ fecha: new Date(`${r.fecha}T00:00:00.000Z`), pesoKg: r.pesoKg, fuente: "manual" as const })),
      skipDuplicates: true,
    });
    weightEntriesCreated = result.count;
  } else {
    console.warn(`WEIGHT_CSV_PATH no encontrado (${csvPath}) — se omite el histórico de peso.`);
  }

  return {
    skipped: false,
    foodGroupsCreated: FOOD_GROUPS.length,
    foodItemsCreated,
    dishesCreated,
    weightEntriesCreated,
  };
}
