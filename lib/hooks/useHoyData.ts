"use client";

import { useCallback, useEffect, useState } from "react";
import { localDayString } from "@/lib/date";
import { reconcileDay } from "@/lib/sync/reconcile";
import { getCachedPlan, getCachedFoodGroups, getCachedCatalog } from "@/lib/db/catalogSync";
import { getDayLogByFecha } from "@/lib/db/dayLogs";
import { getMealEntriesForDay, getPortionsForMeal } from "@/lib/db/mealEntries";
import type {
  PlanRecord,
  FoodGroupRecord,
  FoodItemRecord,
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
  // El catálogo ya estaba en IndexedDB pero ninguna pantalla lo tenía en la
  // mano; sin él el editor no puede decir cuánto vale una porción.
  foodItems: FoodItemRecord[];
  dayLog: DayLogRecord | null;
  meals: MealWithPortions[];
  refresh: () => Promise<void>;
}

// Estado completo de la pantalla Hoy: reconcilia con el servidor (§5.4) y
// siempre termina leyendo de IndexedDB, para que la pantalla funcione igual
// online y offline.
export function useHoyData(fecha: string = localDayString()): HoyData {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PlanRecord | null>(null);
  const [foodGroups, setFoodGroups] = useState<FoodGroupRecord[]>([]);
  const [foodItems, setFoodItems] = useState<FoodItemRecord[]>([]);
  const [dayLog, setDayLog] = useState<DayLogRecord | null>(null);
  const [meals, setMeals] = useState<MealWithPortions[]>([]);

  const load = useCallback(async () => {
    await reconcileDay(fecha);

    const [planRecord, groups, items, dayLogRecord] = await Promise.all([
      getCachedPlan(),
      getCachedFoodGroups(),
      getCachedCatalog(),
      getDayLogByFecha(fecha),
    ]);

    setPlan(planRecord);
    setFoodGroups(groups);
    setFoodItems(items);
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
    // `load` es async y su primera instrucción es un await, así que ningún
    // setState ocurre de forma síncrona dentro del efecto; la regla no puede
    // verlo a través de la frontera async.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Reconciliar al recuperar el foco y al reconectar (§5.4.3) — es como
  // aparece en la app lo que se registró por Telegram mientras estaba cerrada.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alVolver);
    };
  }, [load]);

  return { loading, fecha, plan, foodGroups, foodItems, dayLog, meals, refresh: load };
}
