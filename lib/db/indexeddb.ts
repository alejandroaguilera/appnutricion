import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  FoodGroupRecord,
  FoodItemRecord,
  DishRecord,
  PlanRecord,
  DayLogRecord,
  MealEntryRecord,
  MealEntryPortionRecord,
  OutboxRecord,
} from "./types";

interface AppNutricionDB extends DBSchema {
  foodGroups: {
    key: string;
    value: FoodGroupRecord;
  };
  catalog: {
    key: string;
    value: FoodItemRecord;
    indexes: { "by-foodGroupId": string };
  };
  dishes: {
    key: string;
    value: DishRecord;
    indexes: { "by-tipoComida": string };
  };
  plan: {
    // Un solo NutritionPlan activo a la vez — se guarda con su propio id;
    // el store nunca tiene más de una fila (ver lib/db/catalogSync.ts).
    key: string;
    value: PlanRecord;
  };
  dayLogs: {
    key: string;
    value: DayLogRecord;
    indexes: { "by-fecha": string };
  };
  mealEntries: {
    key: string;
    value: MealEntryRecord;
    indexes: { "by-dayLogId": string };
  };
  mealEntryPortions: {
    key: string;
    value: MealEntryPortionRecord;
    indexes: { "by-mealEntryId": string };
  };
  outbox: {
    key: number;
    value: OutboxRecord;
  };
}

const DB_NAME = "appnutricion-db";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<AppNutricionDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<AppNutricionDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB no disponible (SSR)"));
  }
  if (!dbPromise) {
    dbPromise = openDB<AppNutricionDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("foodGroups", { keyPath: "id" });

        const catalog = db.createObjectStore("catalog", { keyPath: "id" });
        catalog.createIndex("by-foodGroupId", "foodGroupId");

        const dishes = db.createObjectStore("dishes", { keyPath: "id" });
        dishes.createIndex("by-tipoComida", "tipoComida", { multiEntry: true });

        db.createObjectStore("plan", { keyPath: "id" });

        const dayLogs = db.createObjectStore("dayLogs", { keyPath: "id" });
        dayLogs.createIndex("by-fecha", "fecha");

        const mealEntries = db.createObjectStore("mealEntries", { keyPath: "id" });
        mealEntries.createIndex("by-dayLogId", "dayLogId");

        const mealEntryPortions = db.createObjectStore("mealEntryPortions", { keyPath: "id" });
        mealEntryPortions.createIndex("by-mealEntryId", "mealEntryId");

        db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
      },
    });
  }
  return dbPromise;
}

export type { AppNutricionDB };
