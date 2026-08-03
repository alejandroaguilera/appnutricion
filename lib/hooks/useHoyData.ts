"use client";

import { useCallback, useEffect, useState } from "react";
import { localDayString } from "@/lib/date";
import { hydrateDay } from "@/lib/db/hydrateDay";
import { getCachedPlan, getCachedFoodGroups } from "@/lib/db/catalogSync";
import { getDayLogByFecha } from "@/lib/db/dayLogs";
import { getMealEntriesForDay, getPortionsForMeal } from "@/lib/db/mealEntries";
import type {
  PlanRecord,
  FoodGroupRecord,
  DayLogRecord,
  MealEntryRecord,
  MealEntryPortionRecord,
} from "@/lib/db/types";

export interface MealWithPortions {
  entry: MealEntryRecord;
  portions: MealEntryPortionRecord[];
}

export interface HoyData {
  loading: boolean;
  fecha: string;
  plan: PlanRecord | null;
  foodGroups: FoodGroupRecord[];
  dayLog: DayLogRecord | null;
  meals: MealWithPortions[];
  refresh: () => Promise<void>;
}

// Estado completo de la pantalla Hoy: intenta traer lo autoritativo del
// servidor (hydrateDay) y siempre termina leyendo de IndexedDB, para que la
// pantalla funcione igual online y offline.
export function useHoyData(fecha: string = localDayString()): HoyData {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PlanRecord | null>(null);
  const [foodGroups, setFoodGroups] = useState<FoodGroupRecord[]>([]);
  const [dayLog, setDayLog] = useState<DayLogRecord | null>(null);
  const [meals, setMeals] = useState<MealWithPortions[]>([]);

  const load = useCallback(async () => {
    await hydrateDay(fecha);

    const [planRecord, groups, dayLogRecord] = await Promise.all([
      getCachedPlan(),
      getCachedFoodGroups(),
      getDayLogByFecha(fecha),
    ]);

    setPlan(planRecord);
    setFoodGroups(groups);
    setDayLog(dayLogRecord ?? null);

    if (dayLogRecord) {
      const entries = await getMealEntriesForDay(dayLogRecord.id);
      const withPortions = await Promise.all(
        entries.map(async (entry) => ({ entry, portions: await getPortionsForMeal(entry.id) }))
      );
      setMeals(withPortions);
    } else {
      setMeals([]);
    }

    setLoading(false);
  }, [fecha]);

  useEffect(() => {
    void load();
  }, [load]);

  return { loading, fecha, plan, foodGroups, dayLog, meals, refresh: load };
}
