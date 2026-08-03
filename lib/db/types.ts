// Formas del lado del cliente que reflejan los modelos de Prisma en IndexedDB.
// Fechas reales (horaRegistro, actualizadoEn, cerradoEn) viajan como Date
// nativo (IndexedDB soporta structured-clone de Date); se serializan a ISO
// solo al salir por la red (ver toWire() en cada helper de lib/db/*.ts).
// `fecha` de DayLog es un string "YYYY-MM-DD" — es la clave natural de
// búsqueda/orden y evita cualquier ambigüedad de huso horario.

export type PlanMealSlotClave = "desayuno" | "snack_am" | "comida" | "snack_pm" | "post_gym" | "cena";
export type FoodGroupClave =
  | "verdura"
  | "fruta"
  | "cereal"
  | "leguminosa"
  | "aoa_muy_bajo"
  | "aoa_bajo"
  | "aoa_moderado"
  | "grasa_sin_proteina"
  | "grasa_con_proteina"
  | "leche"
  | "libre";
export type TipoComida = "desayuno" | "comida" | "cena" | "snack";
export type OrigenMealEntry = "app" | "telegram" | "import";

// ── Catálogo/plan/platillos: espejo de solo lectura, hidratado desde el
// servidor (lib/db/catalogSync.ts). ──────────────────────────────────────

export interface FoodGroupRecord {
  id: string;
  clave: FoodGroupClave;
  nombre: string;
  orden: number;
  color: string;
  kcal: number;
  proteinaG: number;
  carbosG: number;
  grasaG: number;
}

export interface FoodItemRecord {
  id: string;
  foodGroupId: string;
  nombre: string;
  alias: string[];
  cantidadPorcion: string;
  cantidadGramos: number | null;
  esFavorito: boolean;
  creadoPorUsuario: boolean;
}

export interface DishComponentRecord {
  id: string;
  dishId: string;
  foodItemId: string | null;
  foodGroupId: string;
  porciones: number;
  notaLibre: string | null;
  foodGroup: { clave: FoodGroupClave };
  foodItem: { nombre: string; cantidadPorcion: string } | null;
}

export interface DishRecord {
  id: string;
  nombre: string;
  alias: string[];
  tipoComida: TipoComida[];
  vecesUsado: number;
  components: DishComponentRecord[];
}

export interface PlanSlotTargetRecord {
  id: string;
  planMealSlotId: string;
  foodGroupId: string;
  porciones: number;
  foodGroup: { clave: FoodGroupClave; nombre: string };
}

export interface PlanSlotRecord {
  id: string;
  clave: PlanMealSlotClave;
  nombre: string;
  orden: number;
  horaSugerida: string;
  esOpcional: boolean;
  targets: PlanSlotTargetRecord[];
}

export interface PlanTargetRecord {
  id: string;
  foodGroupId: string;
  porcionesDia: number;
  foodGroup: { clave: FoodGroupClave; nombre: string };
}

export interface PlanRecord {
  id: string;
  nombre: string;
  kcalObjetivo: number;
  proteinaG: number;
  carbosG: number;
  grasaG: number;
  fibraG: number;
  aguaL: number;
  targets: PlanTargetRecord[];
  slots: PlanSlotRecord[];
}

// ── Registro: nace con UUID v4 en el cliente (§0.3, §4). ─────────────────

export interface DayLogRecord {
  id: string; // UUID v4 de cliente
  fecha: string; // "YYYY-MM-DD"
  pesoCorporalKg: number | null;
  aguaMl: number | null;
  notas: string | null;
  animo1a5: number | null;
  hambre1a5: number | null;
  cerradoEn: Date | null;
  revision: number;
}

export type EstadoClasificacion = "clasificado" | "pendiente" | "fallido";

export interface MealEntryRecord {
  id: string; // UUID v4 de cliente
  dayLogId: string;
  planMealSlotId: string | null;
  clave: PlanMealSlotClave;
  horaRegistro: Date;
  dishId: string | null;
  titulo: string | null; // encabezado del renglón (estilo caltrack)
  textoLibre: string | null;
  fueraDeCasa: boolean;
  notas: string | null;
  version: number;
  origen: OrigenMealEntry;
  estadoClasificacion: EstadoClasificacion;
  confianzaIa: number | null;
  fotoPrincipalId: string | null;
  archivadoEn: Date | null; // borrado lógico (§5.4.4)
  actualizadoEn: Date; // base de la reconciliación (§5.4.5)
}

export interface MealEntryPortionRecord {
  id: string; // UUID v4 de cliente
  mealEntryId: string;
  foodGroupId: string;
  foodGroupClave: FoodGroupClave | null; // denormalizada, sobrevive un resembrado
  foodItemId: string | null;
  nombre: string | null; // "Pechuga de pollo"
  cantidad: string | null; // "150 g", "2 piezas"
  orden: number;
  porciones: number;
  kcal: number;
  proteinaG: number;
  carbosG: number;
  grasaG: number;
}

// ── Outbox: mismo shape que appgym. ───────────────────────────────────────

export type OutboxMethod = "PUT" | "DELETE" | "POST";

export interface OutboxRecord {
  seq?: number; // autoIncrement, define el orden de drenado
  eventId: string; // uuid, clave de idempotencia que se le hace eco al servidor
  method: OutboxMethod;
  url: string;
  body: unknown;
  timestampCliente: number; // epoch ms
  intentos: number;
  nextAttemptAt: number; // epoch ms
  permanentError: string | null;
  // Diagnóstico mostrable: sin esto, un fallo de sync era invisible tanto
  // para el atleta como para quien depura.
  ultimoIntentoEn: number | null;
  httpStatus: number | null;
  ultimoError: string | null;
}

// Estado de sincronización por día: hasta qué `revision` del servidor se ha
// fusionado (§5.4.3) y cuándo fue la última consulta.
export interface SyncStateRecord {
  revision: number;
  ultimaSyncEn: number;
  // Solo en la clave "buildReintento": el build en el que ya se dio una
  // segunda oportunidad a los errores permanentes.
  build?: string;
}
