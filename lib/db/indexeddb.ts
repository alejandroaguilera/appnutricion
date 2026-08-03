import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { repairV2, type RepairReport } from "./repair";
import type {
  FoodGroupRecord,
  FoodItemRecord,
  DishRecord,
  PlanRecord,
  DayLogRecord,
  MealEntryRecord,
  MealEntryPortionRecord,
  OutboxRecord,
  SyncStateRecord,
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
  // v2: hasta qué revisión del servidor se fusionó cada día. Clave externa
  // "day:YYYY-MM-DD" (§5.4.3).
  syncState: {
    key: string;
    value: SyncStateRecord;
  };
}

const DB_NAME = "appnutricion-db";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<AppNutricionDB>> | null = null;
let ultimoReporteReparacion: RepairReport | null = null;

// El reporte de la migración v2 se guarda para que AppInit lo registre una
// sola vez en consola: es la única evidencia de qué encontró y qué arregló en
// el teléfono del atleta, y esa migración corre una vez y no se repite.
export function getRepairReport(): RepairReport | null {
  return ultimoReporteReparacion;
}

export function getDB(): Promise<IDBPDatabase<AppNutricionDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB no disponible (SSR)"));
  }
  if (!dbPromise) {
    dbPromise = openDB<AppNutricionDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
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
        }

        if (oldVersion < 2) {
          db.createObjectStore("syncState");
          // Solo tiene sentido reparar si YA había datos (v1 en uso). En una
          // instalación nueva no hay nada que sanar.
          if (oldVersion >= 1) {
            ultimoReporteReparacion = await repairV2(tx);
          }
        }
      },
    });
  }
  return dbPromise;
}

export type { AppNutricionDB };
