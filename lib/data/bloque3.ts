import type { FoodGroupClave, PlanMealSlotClave } from "@prisma/client";
import type { RawDish } from "./dishes";

// Bloque 3: plan 02 de la nutrióloga Alma Lomeli, vigente desde el 2026-09-26.
// Lo siembra `ensureBloque3` (lib/services/dataFixups.ts) sobre la base viva.
//
// Las metas son lo que SUMA EL MENÚ en porciones del SMAE (~1,475 kcal), no las
// 1,990 kcal que declara el PDF. Mismo criterio que el Bloque 2: un objetivo
// que el menú mismo no alcanza deja la app marcando déficit todos los días
// aunque se siga el plan al pie de la letra (§7.4). Si Alma aclara que falta
// un "Snack 2" (el PDF dice "SNACK 1" y no hay otro), va en otro fixup que
// agregue el slot y suba las metas.

export const PLAN_BLOQUE_3 = {
  // Clave de idempotencia de `ensureBloque3`: no cambiarla.
  nombre: "Bloque 3 — Alma Lomeli plan 02",
  vigenteDesde: "2026-09-26",
  /** Cierre de vigencia del plan que estaba activo. */
  vigenciaAnteriorHasta: "2026-09-25",
  kcalObjetivo: 1475,
  proteinaG: 133,
  carbosG: 142,
  grasaG: 37,
  // El PDF no da fibra: se copia del plan activo al migrar. Esto es solo el
  // respaldo si no hubiera ninguno.
  fibraGRespaldo: 29,
  aguaL: 3.0,
  notas: [
    "Plan 02 de Alma Lomeli (recibido 2026-09-25). El PDF declara 1,990 kcal; convertido a SMAE el menú suma ~1,475 kcal (1,300–1,600 según la opción). Las metas siguen el menú hasta que Alma aclare si falta un Snack 2.",
    "Frecuencias: bistec 1 vez/semana, tostadas de picadillo 1 vez/semana, barrita de proteína 2 veces/semana.",
    "Las verduras son libres; hay que incluirlas en las 3 comidas principales. Proteína en gramos, pesada en cocido.",
    "No refrescos ni alcohol.",
  ].join("\n"),
};

// Metas diarias. Proteína y grasa se siembran completas contra su subgrupo
// representativo (REPRESENTATIVE_CLAVE); la barra suma los subgrupos.
// Verdura es un piso: en el plan son libres.
export const DAILY_TARGETS_BLOQUE_3: { clave: FoodGroupClave; porcionesDia: number }[] = [
  { clave: "aoa_muy_bajo", porcionesDia: 15 },
  { clave: "cereal", porcionesDia: 6 },
  { clave: "grasa_sin_proteina", porcionesDia: 2.5 },
  { clave: "fruta", porcionesDia: 1 },
  { clave: "verdura", porcionesDia: 4 },
  { clave: "leguminosa", porcionesDia: 1 },
];

export interface SlotTargetsBloque3 {
  proteina: number;
  cereal: number;
  grasa: number;
  fruta: number;
  verdura: number;
  leguminosa: number;
}

// Cada slot es el promedio de sus 4 opciones redondeado a 0.5; la suma de los
// slots da exactamente DAILY_TARGETS_BLOQUE_3. El PDF no trae horarios:
// `horaSugerida` se copia del slot con la misma clave del plan activo, y
// `horaRespaldo` solo se usa si ese slot no existiera.
//
// `post_gym` no está en el plan de Alma: se conserva opcional y sin metas para
// el batido de los días de gym. `snack_pm` se reutiliza (el enum no se amplía)
// y solo cambia de nombre.
export const SLOTS_BLOQUE_3: {
  clave: PlanMealSlotClave;
  nombre: string;
  orden: number;
  esOpcional: boolean;
  horaRespaldo: string;
  targets: SlotTargetsBloque3;
}[] = [
  { clave: "desayuno", nombre: "Desayuno", orden: 1, esOpcional: false, horaRespaldo: "09:30", targets: { proteina: 3.5, cereal: 2, grasa: 1, fruta: 0.5, verdura: 1, leguminosa: 0 } },
  { clave: "comida", nombre: "Comida", orden: 2, esOpcional: false, horaRespaldo: "13:30", targets: { proteina: 6, cereal: 2, grasa: 0.5, fruta: 0, verdura: 1.5, leguminosa: 1 } },
  { clave: "snack_pm", nombre: "Snack", orden: 3, esOpcional: false, horaRespaldo: "17:00", targets: { proteina: 1, cereal: 0, grasa: 0.5, fruta: 0.5, verdura: 0.5, leguminosa: 0 } },
  { clave: "post_gym", nombre: "Post-gym", orden: 4, esOpcional: true, horaRespaldo: "19:30", targets: { proteina: 0, cereal: 0, grasa: 0, fruta: 0, verdura: 0, leguminosa: 0 } },
  { clave: "cena", nombre: "Cena", orden: 5, esOpcional: false, horaRespaldo: "21:00", targets: { proteina: 4.5, cereal: 2, grasa: 0.5, fruta: 0, verdura: 1, leguminosa: 0 } },
];

// Platillos del plan 02. Mismo formato que el Bloque 2: porciones, nunca kcal
// (los macros salen de SMAE × porciones y se congelan al registrar, §7.1). Cada
// componente se enlaza a un FoodItem del catálogo cuando hay uno que le
// corresponde; la cantidad real del menú va en `notaLibre`. Marcas y productos
// que no existen en el SMAE (hotcakes Kodiak, chips de verdura, barritas) van
// como componentes genéricos, sin `foodItemNombre`.
//
// No come pescado, excepto atún: el "Bowl de salmón (salmón o atún fresco)" del
// PDF se siembra como Bowl de atún, con "bowl de salmón" como alias para que el
// atajo local lo resuelva igual.
export const DISHES_BLOQUE_3: RawDish[] = [
  // ── Desayuno ───────────────────────────────────────────────────────────
  {
    nombre: "Quesadillas de panela con espinacas y uvas",
    alias: ["quesadillas", "quesadillas con espinacas"],
    tipoComida: ["desayuno"],
    descripcion:
      "2 tortillas de harina zero carbs o 6 tortiregias + 120 g queso Oaxaca light o panela + espinacas + jitomate + ½ aguacate chico + 1 taza de uvas.",
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Tortillas delgaditas", porciones: 2, notaLibre: "2 de harina zero carbs o 6 tortiregias" },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Queso panela", porciones: 3, notaLibre: "120 g (o Oaxaca light)" },
      { foodGroupClave: "verdura", porciones: 1, notaLibre: "Espinaca y jitomate — libre" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 1.5, notaLibre: "1/2 pieza chica" },
      { foodGroupClave: "fruta", foodItemNombre: "Uva", porciones: 1, notaLibre: "1 taza" },
    ],
  },
  {
    nombre: "Mollete de pechuga de pollo",
    alias: ["mollete", "molletes de pollo"],
    tipoComida: ["desayuno"],
    descripcion:
      "2 rebanadas de pan + 120 g pechuga desmenuzada (o 4 claras) + ¼ taza frijoles + ½ aguacate chico + pico de gallo + 1 naranja.",
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Pan integral", porciones: 2, notaLibre: "2 rebanadas" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pollo desmenuzado", porciones: 4, notaLibre: "120 g de pechuga (o 4 claras)" },
      { foodGroupClave: "leguminosa", foodItemNombre: "Frijoles molidos", porciones: 0.75, notaLibre: "1/4 taza" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 1.5, notaLibre: "1/2 pieza chica" },
      { foodGroupClave: "verdura", foodItemNombre: "Pico de gallo", porciones: 0.5 },
      { foodGroupClave: "fruta", foodItemNombre: "Naranja", porciones: 0.5, notaLibre: "1 pieza" },
    ],
  },
  {
    nombre: "Hotcakes de proteína con huevo y espinacas",
    alias: ["hotcakes", "hotcakes de proteína", "kodiak"],
    tipoComida: ["desayuno"],
    descripcion:
      "2 hotcakes de proteína (Kodiak o Premier) + 4 claras con ½ taza de espinacas + ¼ de aguacate. Opcional: ½ taza de fresas (ajustar fruta +0.5 al confirmar).",
    componentes: [
      { foodGroupClave: "cereal", porciones: 1, notaLibre: "2 hotcakes de proteína Kodiak o Premier" },
      { foodGroupClave: "aoa_muy_bajo", porciones: 1, notaLibre: "aporte proteico de los hotcakes" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Claras de huevo", porciones: 2, notaLibre: "4 claras" },
      { foodGroupClave: "verdura", foodItemNombre: "Espinaca cocida", porciones: 1, notaLibre: "1/2 taza" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 0.75, notaLibre: "1/4 pieza" },
    ],
  },
  {
    nombre: "Machado de res con claras",
    alias: ["machaca", "machado", "machacado con huevo"],
    tipoComida: ["desayuno"],
    descripcion:
      "4 claras + 30 g machado de res + ½ cdita aceite de oliva + pico de gallo + 2 tortillas de maíz + 1 manzana.",
    componentes: [
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Claras de huevo", porciones: 2, notaLibre: "4 claras" },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Carne seca", porciones: 2, notaLibre: "30 g de machado de res" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aceite de oliva", porciones: 0.5, notaLibre: "1/2 cdita" },
      { foodGroupClave: "verdura", foodItemNombre: "Pico de gallo", porciones: 0.5 },
      { foodGroupClave: "cereal", foodItemNombre: "Tortilla de maíz", porciones: 2, notaLibre: "2 tortillas" },
      { foodGroupClave: "fruta", foodItemNombre: "Manzana chica", porciones: 1, notaLibre: "1 pieza" },
    ],
  },

  // ── Comida ─────────────────────────────────────────────────────────────
  {
    nombre: "Bistec a la plancha con pimientos",
    alias: ["bistec", "t-bone", "carne asada"],
    tipoComida: ["comida"],
    descripcion:
      "1 VEZ POR SEMANA. 180 g bistec o t-bone + 1 taza pimientos + cebolla + ½ cdita aceite de oliva + ¼ taza arroz cocido + ½ papa.",
    componentes: [
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Carne de res", porciones: 6, notaLibre: "180 g de bistec o t-bone, cocido" },
      { foodGroupClave: "verdura", foodItemNombre: "Pimiento cocido", porciones: 2, notaLibre: "1 taza de pimientos + cebolla" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aceite de oliva", porciones: 0.5, notaLibre: "1/2 cdita" },
      { foodGroupClave: "cereal", foodItemNombre: "Arroz blanco o integral", porciones: 0.75, notaLibre: "1/4 taza cocido" },
      { foodGroupClave: "cereal", foodItemNombre: "Papa cocida", porciones: 1, notaLibre: "1/2 pieza" },
    ],
  },
  {
    nombre: "Bowl de atún",
    alias: ["bowl de salmón", "bowl de atún", "bowl"],
    tipoComida: ["comida"],
    descripcion:
      "El PDF de Alma dice salmón o atún fresco; Alejandro no come salmón. ½ taza arroz blanco + espinacas + 5 tomates cherry + lechuga + ½ taza frijoles negros + ¼ mango + 180 g atún fresco.",
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Arroz blanco o integral", porciones: 1.5, notaLibre: "1/2 taza de arroz blanco" },
      { foodGroupClave: "verdura", porciones: 1.5, notaLibre: "Espinaca, 5 tomates cherry y lechuga — libre" },
      { foodGroupClave: "leguminosa", foodItemNombre: "Frijoles molidos", porciones: 1, notaLibre: "1/2 taza de frijoles negros" },
      { foodGroupClave: "fruta", foodItemNombre: "Mango", porciones: 0.5, notaLibre: "1/4 pieza" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Medallón de atún", porciones: 6, notaLibre: "180 g de atún fresco" },
    ],
  },
  {
    nombre: "Tostadas de picadillo con frijoles",
    alias: ["picadillo", "tostadas de picadillo"],
    tipoComida: ["comida"],
    descripcion:
      "1 VEZ POR SEMANA. 180 g carne molida 90/5 o molida de pavo + pico de gallo + ½ taza zanahoria y papa + salsa casera + 2 tostadas deshidratadas + ¼ taza frijoles.",
    componentes: [
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Carne molida", porciones: 6, notaLibre: "180 g 90/5 (o molida de pavo)" },
      { foodGroupClave: "verdura", porciones: 1, notaLibre: "Pico de gallo y zanahoria — libre" },
      { foodGroupClave: "cereal", foodItemNombre: "Papa cocida", porciones: 0.5, notaLibre: "1/4 taza" },
      { foodGroupClave: "cereal", foodItemNombre: "Tostada de maíz deshidratada", porciones: 1, notaLibre: "2 tostadas" },
      { foodGroupClave: "leguminosa", foodItemNombre: "Frijoles molidos", porciones: 0.75, notaLibre: "1/4 taza" },
    ],
  },
  {
    nombre: "Ceviche de atún",
    alias: ["ceviche", "ceviche de atún"],
    tipoComida: ["comida"],
    descripcion:
      "180 g medallón de atún en cubos marinado (Maggi, soya, limón) + cebolla + pepino + ½ taza garbanzos + 4 tostadas deshidratadas + ¼ aguacate.",
    componentes: [
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Medallón de atún", porciones: 6, notaLibre: "180 g en cubos" },
      { foodGroupClave: "verdura", porciones: 1, notaLibre: "Pepino y cebolla — libre" },
      { foodGroupClave: "leguminosa", foodItemNombre: "Garbanzo cocido", porciones: 1, notaLibre: "1/2 taza" },
      { foodGroupClave: "cereal", foodItemNombre: "Tostada de maíz deshidratada", porciones: 2, notaLibre: "4 tostadas" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 0.75, notaLibre: "1/4 pieza" },
    ],
  },

  // ── Snack ──────────────────────────────────────────────────────────────
  {
    nombre: "Pepino con piña y cacahuates",
    alias: ["pepino con piña", "pepinos"],
    tipoComida: ["snack"],
    descripcion: "1 taza pepino sin semilla + ½ taza piña + 10 cacahuates naturales o pistaches + Tajín.",
    componentes: [
      { foodGroupClave: "verdura", foodItemNombre: "Pepino rebanado", porciones: 1, notaLibre: "1 taza sin semilla" },
      { foodGroupClave: "fruta", foodItemNombre: "Piña", porciones: 0.5, notaLibre: "1/2 taza" },
      { foodGroupClave: "grasa_con_proteina", foodItemNombre: "Cacahuates sin sal", porciones: 0.7, notaLibre: "10 cacahuates (o pistaches)" },
    ],
  },
  {
    nombre: "Chips de verdura con hummus",
    alias: ["chips con hummus", "hummus"],
    tipoComida: ["snack"],
    descripcion:
      "1 taza chips de verdura (marca recomendada) + ¼ taza hummus. Chips estimados como 1 cereal + 1 grasa; corregir con la etiqueta si se conoce.",
    componentes: [
      { foodGroupClave: "cereal", porciones: 1, notaLibre: "1 taza de chips de verdura" },
      { foodGroupClave: "grasa_sin_proteina", porciones: 1, notaLibre: "aceite de los chips (estimado)" },
      { foodGroupClave: "leguminosa", foodItemNombre: "Hummus de garbanzo", porciones: 1, notaLibre: "1/4 taza" },
    ],
  },
  {
    nombre: "Jícama con piña y cacahuates",
    alias: ["jícama", "jicama con piña"],
    tipoComida: ["snack"],
    descripcion: "½ taza jícama + ½ taza piña + 10 cacahuates o pistaches + Tajín.",
    componentes: [
      { foodGroupClave: "verdura", foodItemNombre: "Jícama", porciones: 1, notaLibre: "1/2 taza" },
      { foodGroupClave: "fruta", foodItemNombre: "Piña", porciones: 0.5, notaLibre: "1/2 taza" },
      { foodGroupClave: "grasa_con_proteina", foodItemNombre: "Cacahuates sin sal", porciones: 0.7, notaLibre: "10 cacahuates (o pistaches)" },
    ],
  },
  {
    nombre: "Barrita de proteína",
    alias: ["barrita", "barra david", "wild protein"],
    tipoComida: ["snack"],
    descripcion:
      "2 VECES POR SEMANA. 1 barrita David o Wild Protein. Estimada como 4 porciones de AOA muy bajo (~28 g de proteína).",
    componentes: [{ foodGroupClave: "aoa_muy_bajo", porciones: 4, notaLibre: "1 barrita David o Wild Protein (~28 g de proteína)" }],
  },

  // ── Cena ───────────────────────────────────────────────────────────────
  {
    nombre: "Sincronizada de pavo y panela",
    alias: ["sincronizada", "sincronizadas"],
    tipoComida: ["cena"],
    descripcion:
      "2 tortillas de maíz + 4 rebanadas pechuga de pavo + 90 g panela + ½ cdita aceite de oliva + espinacas + salsa casera.",
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Tortilla de maíz", porciones: 2, notaLibre: "2 tortillas" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pechuga de pavo (2 rebanadas)", porciones: 2, notaLibre: "4 rebanadas" },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Queso panela", porciones: 2.25, notaLibre: "90 g" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aceite de oliva", porciones: 0.5, notaLibre: "1/2 cdita" },
      { foodGroupClave: "verdura", porciones: 1, notaLibre: "Espinaca y salsa casera — libre" },
    ],
  },
  {
    nombre: "Claras con espinacas y pavo",
    alias: ["huevo con espinacas", "claras con espinaca"],
    tipoComida: ["cena"],
    descripcion:
      "6 claras + 2 rebanadas pechuga de pavo + pico de gallo + espinacas + 2 tortillas de maíz o 2 rebanadas de pan.",
    componentes: [
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Claras de huevo", porciones: 3, notaLibre: "6 claras" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pechuga de pavo (2 rebanadas)", porciones: 1 },
      { foodGroupClave: "verdura", porciones: 1.5, notaLibre: "Pico de gallo y espinaca — libre" },
      { foodGroupClave: "cereal", foodItemNombre: "Tortilla de maíz", porciones: 2, notaLibre: "2 tortillas (o 2 rebanadas de pan)" },
    ],
  },
  {
    nombre: "Omelette de pimientos",
    alias: ["omelette", "omelet", "omelete"],
    tipoComida: ["cena"],
    descripcion:
      "6 claras + 4 rebanadas pechuga de pavo + ½ cdita aceite de oliva + pimientos + espinacas + 2 rebanadas de pan.",
    componentes: [
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Claras de huevo", porciones: 3, notaLibre: "6 claras" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pechuga de pavo (2 rebanadas)", porciones: 2, notaLibre: "4 rebanadas" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aceite de oliva", porciones: 0.5, notaLibre: "1/2 cdita" },
      { foodGroupClave: "verdura", foodItemNombre: "Pimiento cocido", porciones: 1.5, notaLibre: "pimientos y espinaca" },
      { foodGroupClave: "cereal", foodItemNombre: "Pan integral", porciones: 2, notaLibre: "2 rebanadas" },
    ],
  },
  {
    nombre: "Claras con papa",
    alias: ["huevo con papa", "claras con papa"],
    tipoComida: ["cena"],
    descripcion: "6 claras + ½ papa pequeña + pico de gallo + 30 g panela baja en grasa + 2 tortillas de maíz.",
    componentes: [
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Claras de huevo", porciones: 3, notaLibre: "6 claras" },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Queso panela", porciones: 0.75, notaLibre: "30 g baja en grasa" },
      { foodGroupClave: "cereal", foodItemNombre: "Papa cocida", porciones: 0.75, notaLibre: "1/2 pieza pequeña" },
      { foodGroupClave: "cereal", foodItemNombre: "Tortilla de maíz", porciones: 2, notaLibre: "2 tortillas" },
      { foodGroupClave: "verdura", foodItemNombre: "Pico de gallo", porciones: 0.5 },
    ],
  },
];

// El plan de Alma no tiene post-gym; el "Batido post-entreno" que existía es
// del Bloque 1 y está archivado. Se crea uno activo para el slot opcional.
export const BATIDO_POST_GYM: RawDish = {
  nombre: "Batido de proteína post-gym",
  alias: ["batido", "proteína", "post gym"],
  tipoComida: ["snack"],
  descripcion: "1 scoop de proteína en polvo en agua, después de entrenar.",
  componentes: [
    { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Proteína en polvo", porciones: 3, notaLibre: "1 scoop en agua" },
  ],
};
