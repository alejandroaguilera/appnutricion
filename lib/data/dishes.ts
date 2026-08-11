import type { FoodGroupClave, TipoComida } from "@prisma/client";

export interface RawComponent {
  foodGroupClave: FoodGroupClave;
  /** Nombre exacto de un FoodItem sembrado (lib/data/foodItems.ts). Se omite
   * para un componente genérico (condimento sin valor de intercambio, o
   * verdura "libre" cuya cantidad real no es fija — §3.1: el target de
   * verdura es un piso, no un techo, así que no importa fijar el ítem). */
  foodItemNombre?: string;
  porciones: number;
  notaLibre?: string;
}

export interface RawDish {
  nombre: string;
  alias?: string[];
  tipoComida: TipoComida[];
  componentes: RawComponent[];
  /** Se siembra con `archivadoEn` poblado: presente en la base y en el
   * historial, ausente de la interfaz de registro (§5.4.4, borrado lógico). */
  archivado?: boolean;
}

// Platillos del Bloque 1, transcritos de §10.3. Los desayunos y cenas usan los
// nombres literales del spec; los snacks AM/PM y post-gym no traen nombre
// propio en el documento (solo listas de ingredientes) — se les asignó una
// etiqueta descriptiva corta, no una invención de datos nutricionales.
//
// Desde el 2026-08-10 el plan vigente es el Bloque 2 y estos 22 quedan
// archivados en bloque (ver DISHES, abajo). No se borran: hay MealEntry que
// apuntan a ellos y el historial tiene que seguir leyéndose.
const BLOQUE_1: RawDish[] = [
  // ── Desayunos (4 proteína · 2 cereal · 1 grasa · verdura libre) ────────
  {
    nombre: "Huevo revuelto con jamón y espinaca",
    alias: ["huevo revuelto", "huevos con jamón", "lo de siempre"],
    tipoComida: ["desayuno"],
    componentes: [
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Huevo entero", porciones: 3.0 },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pechuga de pavo (2 rebanadas)", porciones: 1.0 },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Espinaca — libre" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Jitomate — libre" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aceite de oliva", porciones: 1.0 },
      { foodGroupClave: "cereal", foodItemNombre: "Tortillas delgaditas", porciones: 2.0, notaLibre: "6 delgaditas" },
    ],
  },
  {
    nombre: "Avo Egg Toast",
    tipoComida: ["desayuno"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Pan integral", porciones: 2.0, notaLibre: "2 rebanadas" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 1.0 },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Huevo entero", porciones: 2.0 },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Queso panela", porciones: 1.0, notaLibre: "40 g" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Espinaca — libre" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Tomate cherry — libre" },
    ],
  },
  {
    nombre: "Protein Pancakes / Hulk Pancakes",
    tipoComida: ["desayuno"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Avena en hojuelas", porciones: 1.0, notaLibre: "1/3 taza" },
      { foodGroupClave: "fruta", foodItemNombre: "Plátano", porciones: 1.0, notaLibre: "1/2 plátano" },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Huevo entero", porciones: 1.0 },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Claras de huevo", porciones: 1.0, notaLibre: "2 claras" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Proteína en polvo", porciones: 1.0, notaLibre: "1/3 scoop" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Yogurt griego", porciones: 0.5, notaLibre: "topping, 2 cdas" },
      { foodGroupClave: "libre", porciones: 1.0, notaLibre: "miel Karo light sin azúcar (topping)" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "1 taza espinaca — versión Hulk, opcional" },
    ],
  },
  {
    nombre: "French Toast Fit",
    tipoComida: ["desayuno"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Pan integral", porciones: 2.0, notaLibre: "2 rebanadas" },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Huevo entero", porciones: 2.0 },
      { foodGroupClave: "libre", porciones: 1.0, notaLibre: "canela" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Yogurt griego", porciones: 3.0, notaLibre: "topping, 1 taza" },
      { foodGroupClave: "fruta", foodItemNombre: "Plátano", porciones: 1.0, notaLibre: "1/2 plátano" },
    ],
  },
  {
    nombre: "Licuado de proteína completo",
    tipoComida: ["desayuno"],
    componentes: [
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Leche de almendra o coco", porciones: 1.0, notaLibre: "1 taza leche de almendra" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Proteína en polvo", porciones: 3.0, notaLibre: "1 scoop" },
      { foodGroupClave: "fruta", foodItemNombre: "Plátano", porciones: 1.0, notaLibre: "1/2 plátano" },
      { foodGroupClave: "cereal", foodItemNombre: "Avena en hojuelas", porciones: 1.0, notaLibre: "1/3 taza" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Espinaca — libre" },
      { foodGroupClave: "grasa_con_proteina", foodItemNombre: "Semillas de chía", porciones: 0.5, notaLibre: "1 cda" },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Huevo entero", porciones: 2.0, notaLibre: "2 huevos cocidos aparte" },
    ],
  },
  {
    nombre: "Peanutbutter Oatmeal",
    tipoComida: ["desayuno"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Avena en hojuelas", porciones: 1.0, notaLibre: "1/3 taza" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Leche de almendra o coco", porciones: 0.5, notaLibre: "1/3 taza" },
      { foodGroupClave: "grasa_con_proteina", foodItemNombre: "Crema de cacahuate", porciones: 1.0, notaLibre: "1 cdita" },
      { foodGroupClave: "fruta", foodItemNombre: "Plátano", porciones: 1.0, notaLibre: "1/2 plátano" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Yogurt griego", porciones: 3.0, notaLibre: "1 taza" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Proteína en polvo", porciones: 3.0, notaLibre: "1 scoop" },
    ],
  },
  {
    nombre: "Ricotta Toast",
    tipoComida: ["desayuno"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Pan integral", porciones: 2.0, notaLibre: "2 rebanadas" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 1.0 },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Requesón", porciones: 2.0, notaLibre: "6 cdas" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pechuga de pavo (2 rebanadas)", porciones: 1.0 },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Tomate — libre" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Espinaca — libre" },
    ],
  },

  // ── Cenas (4 proteína · 2 cereal · 1 grasa · 2 verduras) ───────────────
  {
    nombre: "Pavo-Panela Sándwich",
    tipoComida: ["cena"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Pan integral", porciones: 2.0, notaLibre: "2 rebanadas" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 1.0 },
      { foodGroupClave: "libre", porciones: 1.0, notaLibre: "mostaza" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pechuga de pavo (2 rebanadas)", porciones: 2.0, notaLibre: "4 rebanadas" },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Queso panela", porciones: 2.0, notaLibre: "80 g" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Espinaca — libre" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Tomate — libre" },
    ],
  },
  {
    nombre: "Miguitas con Huevo",
    tipoComida: ["cena"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Tortillas delgaditas", porciones: 2.0, notaLibre: "5-6 delgaditas" },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Huevo entero", porciones: 3.0 },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Queso panela", porciones: 1.0, notaLibre: "40 g" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Champiñones o espinaca — libre" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aceite de oliva", porciones: 1.0, notaLibre: "1 cdita" },
    ],
  },
  {
    nombre: "Chilaquiles Fit",
    tipoComida: ["cena"],
    componentes: [
      { foodGroupClave: "cereal", porciones: 3.0, notaLibre: "15 totopos Susalia" },
      { foodGroupClave: "libre", porciones: 1.0, notaLibre: "salsa casera" },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Huevo entero", porciones: 3.0, notaLibre: "alternativa: 90 g pollo" },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Queso panela", porciones: 1.0, notaLibre: "40 g" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Nopalitos — libre" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 1.0, notaLibre: "1/3 aguacate" },
    ],
  },
  {
    nombre: "Sincronizadas o Crepa Salada",
    tipoComida: ["cena"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Tortillas delgaditas", porciones: 2.0, notaLibre: "6 delgaditas (alt: 2 crepas CAREM)" },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Queso panela", porciones: 2.0, notaLibre: "80 g (alt: 60 g Oaxaca)" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pechuga de pavo (2 rebanadas)", porciones: 2.0, notaLibre: "4 rebanadas" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Tomate — libre" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Espinaca — libre" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 1.0, notaLibre: "1/3 aguacate" },
    ],
  },
  {
    nombre: "Tostadas con Frijoles y Pollo",
    tipoComida: ["cena"],
    componentes: [
      { foodGroupClave: "cereal", porciones: 2.0, notaLibre: "3-4 tostadas Susalia" },
      { foodGroupClave: "leguminosa", foodItemNombre: "Frijoles molidos", porciones: 1.0, notaLibre: "1/3 taza" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pollo", porciones: 4.0, notaLibre: "120 g" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "verduras al gusto — libre" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 1.0, notaLibre: "1/3 aguacate" },
    ],
  },
  {
    nombre: "Rainbow Bowl",
    tipoComida: ["cena"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Arroz blanco o integral", porciones: 2.0, notaLibre: "2/3 taza (alt: quinoa)" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pollo", porciones: 4.0, notaLibre: "120 g (alt: atún o pavo)" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Lechugas — libre" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Tomate — libre" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Pepino — libre" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Zanahoria — libre" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 1.0, notaLibre: "1/3 aguacate" },
    ],
  },
  {
    nombre: "Nutrified Burger",
    tipoComida: ["cena"],
    componentes: [
      { foodGroupClave: "cereal", porciones: 2.0, notaLibre: "2 rebanadas pan thin rounds" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Mayonesa light", porciones: 1.0, notaLibre: "1 cdita" },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Carne de res", porciones: 3.0, notaLibre: "90 g (alt: pollo)" },
      { foodGroupClave: "aoa_moderado", foodItemNombre: "Queso Oaxaca", porciones: 1.5, notaLibre: "40 g (alt: panela)" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Tomate — libre" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Lechuga — libre" },
    ],
  },
  {
    nombre: "Taquitos de Huevo o Pollo",
    tipoComida: ["cena"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Tortillas delgaditas", porciones: 2.0, notaLibre: "6 delgaditas" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pollo", porciones: 4.0, notaLibre: "120 g (alt: 3 huevos)" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pechuga de pavo (2 rebanadas)", porciones: 1.0 },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Espinaca — libre" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Tomate guisado — libre" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aceite de oliva", porciones: 1.0, notaLibre: "1 cdita" },
    ],
  },
  {
    nombre: "Tostadas de Atún",
    tipoComida: ["cena"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Tostada de maíz deshidratada", porciones: 2.0, notaLibre: "3-4 tostadas" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Atún", porciones: 4.0, notaLibre: "120 g" },
      { foodGroupClave: "libre", porciones: 1.0, notaLibre: "limón" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Zanahoria rallada — libre" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Pepino — libre" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Tomate — libre" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 1.0, notaLibre: "1/3 aguacate" },
    ],
  },

  // ── Snacks AM (2 proteína · 1 fruta) ───────────────────────────────────
  // Sin nombre propio en §10.3 (solo lista de ingredientes) — etiqueta descriptiva.
  {
    nombre: "Yogurt griego con fruta",
    tipoComida: ["snack"],
    componentes: [
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Yogurt griego", porciones: 2.0, notaLibre: "1 yogurt individual" },
      { foodGroupClave: "fruta", porciones: 1.0, notaLibre: "fruta a elección" },
      { foodGroupClave: "grasa_con_proteina", foodItemNombre: "Semillas de chía", porciones: 0.5, notaLibre: "opcional" },
    ],
  },
  {
    nombre: "Barrita de proteína con fruta",
    tipoComida: ["snack"],
    componentes: [
      { foodGroupClave: "aoa_muy_bajo", porciones: 2.0, notaLibre: "1/2 barrita de proteína Kirkland o Quest" },
      { foodGroupClave: "fruta", porciones: 1.0, notaLibre: "fruta a elección" },
    ],
  },
  {
    nombre: "Rollitos de pavo o panela con fruta",
    tipoComida: ["snack"],
    componentes: [
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pechuga de pavo (2 rebanadas)", porciones: 2.0, notaLibre: "2 rollitos (alt: 40 g panela)" },
      { foodGroupClave: "fruta", porciones: 1.0, notaLibre: "fruta a elección" },
    ],
  },
  {
    nombre: "Rice cakes con crema de cacahuate y yogurt",
    tipoComida: ["snack"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Galletas de arroz inflado", porciones: 1.0, notaLibre: "2 rice cakes" },
      { foodGroupClave: "grasa_con_proteina", foodItemNombre: "Crema de cacahuate", porciones: 1.0, notaLibre: "1 cdita" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Yogurt griego", porciones: 2.0, notaLibre: "1 yogurt individual" },
    ],
  },

  // ── Snack PM / pre-gym (1 proteína · 1 cereal · 1 grasa · 1 fruta) ─────
  {
    nombre: "Rice cakes con crema de cacahuate y fruta",
    tipoComida: ["snack"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Galletas de arroz inflado", porciones: 1.0, notaLibre: "2 rice cakes (alt: 1 rebanada pan integral)" },
      { foodGroupClave: "grasa_con_proteina", foodItemNombre: "Crema de cacahuate", porciones: 1.5, notaLibre: "1-2 cditas" },
      { foodGroupClave: "fruta", foodItemNombre: "Plátano", porciones: 1.0, notaLibre: "1/2 plátano (alt: 2 dátiles)" },
    ],
  },

  // ── Post-gym (3 proteína) ───────────────────────────────────────────────
  {
    nombre: "Batido post-entreno",
    tipoComida: ["snack"],
    componentes: [
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Proteína en polvo", porciones: 3.0, notaLibre: "1 scoop en 250-300 ml de agua" },
    ],
  },
];

// Menú de la nutrióloga Alma Lomeli, vigente desde el 2026-08-10. Las
// cantidades salen del PDF original, no del resumen de `03-PLAN-NUTRICION.md`
// (que en Desayuno 4 y Cenas 2 y 4 subestima el total).
//
// Los platillos guardan porciones, nunca kcal: los macros salen de SMAE ×
// porciones y se congelan al registrar (§7.1). La tabla de kcal por platillo
// del Bloque 2 es una estimación con bases genéricas y no tiene dónde vivir
// en el modelo — ni debería, porque haría incomparables los registros.
//
// Tocino, aderezo ranch, miel y Protein Premier van como componentes
// genéricos (sin `foodItemNombre`): son marcas o cantidades que no existen en
// el catálogo del SMAE y meterlas como intercambio sería inventar un dato.
export const DISHES_BLOQUE_2: RawDish[] = [
  // ── Desayuno (9:00-10:00 am) ───────────────────────────────────────────
  {
    nombre: "Huevo revuelto con verduras y queso panela",
    alias: ["huevo revuelto", "huevo con verduras"],
    tipoComida: ["desayuno"],
    componentes: [
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Huevo entero", porciones: 2.0, notaLibre: "2 huevos enteros" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Claras de huevo", porciones: 1.0, notaLibre: "2 claras" },
      { foodGroupClave: "verdura", foodItemNombre: "Espinaca cocida", porciones: 1.0, notaLibre: "1/2 taza" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "Jitomate, cebolla y chile serrano — libre" },
      { foodGroupClave: "cereal", foodItemNombre: "Tortilla de maíz", porciones: 2.0, notaLibre: "2 tortillas" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 1.5, notaLibre: "1/2 pieza" },
      { foodGroupClave: "leguminosa", foodItemNombre: "Frijoles molidos", porciones: 0.75, notaLibre: "1/4 taza" },
      { foodGroupClave: "fruta", foodItemNombre: "Jugo de naranja natural", porciones: 2.0, notaLibre: "1 taza" },
      { foodGroupClave: "libre", porciones: 1.0, notaLibre: "salsa casera al gusto" },
    ],
  },
  {
    nombre: "Sándwich de huevo",
    alias: ["sandwich de huevo", "sandwich de claras"],
    tipoComida: ["desayuno"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Pan integral", porciones: 2.0, notaLibre: "2 rebanadas" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Claras de huevo", porciones: 2.0, notaLibre: "4 claras" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pechuga de pavo (2 rebanadas)", porciones: 1.0 },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Queso panela", porciones: 0.5, notaLibre: "20 g" },
      { foodGroupClave: "verdura", foodItemNombre: "Espinaca cruda", porciones: 0.5, notaLibre: "1 taza" },
      { foodGroupClave: "verdura", foodItemNombre: "Jitomate bola", porciones: 1.0, notaLibre: "en rodajas" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 1.5, notaLibre: "1/2 pieza" },
      { foodGroupClave: "fruta", foodItemNombre: "Fresa rebanada", porciones: 1.0, notaLibre: "1 taza" },
    ],
  },
  {
    nombre: "Avocado toast con panela",
    alias: ["avocado toast", "avo toast"],
    tipoComida: ["desayuno"],
    componentes: [
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Queso panela", porciones: 3.0, notaLibre: "120 g guisados" },
      { foodGroupClave: "verdura", foodItemNombre: "Pico de gallo", porciones: 1.0 },
      { foodGroupClave: "verdura", foodItemNombre: "Espinaca cruda", porciones: 0.5 },
      { foodGroupClave: "cereal", foodItemNombre: "Pan integral", porciones: 2.0, notaLibre: "2 rebanadas" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Guacamole", porciones: 4.0, notaLibre: "1/2 taza" },
      { foodGroupClave: "fruta", porciones: 1.0, notaLibre: "1 taza de fruta mixta" },
    ],
  },
  {
    nombre: "Molletes de queso panela con pico de gallo",
    alias: ["molletes"],
    tipoComida: ["desayuno"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Pan integral", porciones: 2.0, notaLibre: "2 rebanadas tostadas" },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Queso panela", porciones: 3.0, notaLibre: "120 g" },
      { foodGroupClave: "verdura", foodItemNombre: "Pico de gallo", porciones: 1.0 },
      { foodGroupClave: "grasa_con_proteina", porciones: 0.5, notaLibre: "1/2 rebanada de tocino" },
    ],
  },
  {
    nombre: "Licuado rápido de proteína y espinaca",
    alias: ["licuado", "licuado rapido", "opcion rapida"],
    tipoComida: ["desayuno"],
    componentes: [
      { foodGroupClave: "leche", foodItemNombre: "Leche deslactosada light", porciones: 1.0, notaLibre: "1 taza" },
      { foodGroupClave: "verdura", foodItemNombre: "Espinaca cruda", porciones: 0.5 },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Proteína en polvo", porciones: 3.0, notaLibre: "1 scoop" },
    ],
  },

  // ── Comida (1:00-2:00 pm) ──────────────────────────────────────────────
  {
    nombre: "Pechuga a la plancha con arroz y frijoles",
    alias: ["pechuga con arroz", "pollo con arroz"],
    tipoComida: ["comida"],
    componentes: [
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aceite de oliva", porciones: 0.5, notaLibre: "1/2 cdita (o PAM)" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pechuga de pollo", porciones: 6.0, notaLibre: "180 g" },
      { foodGroupClave: "cereal", foodItemNombre: "Arroz blanco o integral", porciones: 3.0, notaLibre: "1 taza" },
      { foodGroupClave: "leguminosa", foodItemNombre: "Frijoles molidos", porciones: 0.75, notaLibre: "1/4 taza, enteros" },
      { foodGroupClave: "verdura", foodItemNombre: "Brócoli", porciones: 2.0, notaLibre: "1 taza" },
    ],
  },
  {
    nombre: "Pasta con carne molida",
    alias: ["pasta con carne", "espagueti con carne"],
    tipoComida: ["comida"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Pasta integral cocida", porciones: 2.5, notaLibre: "138 g cocida" },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Carne molida", porciones: 6.0, notaLibre: "180 g" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "verdura del guisado y salsa — libre" },
      { foodGroupClave: "verdura", foodItemNombre: "Lechuga", porciones: 0.5, notaLibre: "1 taza de ensalada mixta" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 1.5, notaLibre: "1/2 pieza" },
    ],
  },
  {
    nombre: "Guisado de papa con carne",
    alias: ["guisado de papa", "papa con carne", "milanesa picada"],
    tipoComida: ["comida"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Papa cocida", porciones: 2.0, notaLibre: "1 pieza en cubitos" },
      { foodGroupClave: "verdura", foodItemNombre: "Pico de gallo", porciones: 1.0, notaLibre: "1 taza (o pimientos)" },
      { foodGroupClave: "verdura", foodItemNombre: "Calabacita", porciones: 0.5, notaLibre: "1/2 taza" },
      { foodGroupClave: "aoa_bajo", foodItemNombre: "Carne de res", porciones: 6.0, notaLibre: "180 g de milanesa picada" },
      { foodGroupClave: "leguminosa", foodItemNombre: "Frijoles molidos", porciones: 1.5, notaLibre: "1/2 taza" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 0.75, notaLibre: "1/4 pieza" },
    ],
  },
  {
    nombre: "Fajita de pollo con pimientos",
    alias: ["fajitas", "fajita de pollo"],
    tipoComida: ["comida"],
    componentes: [
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pechuga de pollo", porciones: 6.0, notaLibre: "180 g en tiritas" },
      { foodGroupClave: "verdura", foodItemNombre: "Pimiento cocido", porciones: 2.0, notaLibre: "1 taza de pimientos de colores" },
      { foodGroupClave: "cereal", foodItemNombre: "Tortilla de maíz", porciones: 3.0, notaLibre: "3 tortillas (alt: 6 tortiregias)" },
      { foodGroupClave: "leguminosa", foodItemNombre: "Frijoles molidos", porciones: 1.5, notaLibre: "1 taza de ensalada de frijoles" },
      { foodGroupClave: "verdura", foodItemNombre: "Pico de gallo", porciones: 1.0 },
    ],
  },

  // ── Snack pre-gym (5:00-5:30 pm) ───────────────────────────────────────
  {
    nombre: "Bowl de yogur griego con fresas y nueces",
    alias: ["bowl de fruta", "yogur con fresas"],
    tipoComida: ["snack"],
    componentes: [
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Yogurt griego", porciones: 2.25, notaLibre: "3/4 taza" },
      { foodGroupClave: "fruta", foodItemNombre: "Fresa rebanada", porciones: 2.0, notaLibre: "2 tazas" },
      { foodGroupClave: "grasa_con_proteina", foodItemNombre: "Nuez en mitades", porciones: 1.0, notaLibre: "2 cdas de nueces mixtas" },
    ],
  },
  {
    nombre: "Oat meal preps",
    alias: ["oat meal", "avena preparada", "overnight oats"],
    tipoComida: ["snack"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Avena en hojuelas", porciones: 1.5, notaLibre: "1/2 taza" },
      { foodGroupClave: "leche", foodItemNombre: "Leche deslactosada light", porciones: 1.0, notaLibre: "1 taza (alt: de almendras)" },
      { foodGroupClave: "fruta", foodItemNombre: "Fresa rebanada", porciones: 0.5, notaLibre: "5 fresas" },
      { foodGroupClave: "fruta", foodItemNombre: "Manzana chica", porciones: 1.0, notaLibre: "1 pieza" },
      { foodGroupClave: "fruta", foodItemNombre: "Plátano", porciones: 1.0, notaLibre: "1/2 pieza" },
      { foodGroupClave: "cereal", foodItemNombre: "Granola sin azúcar", porciones: 1.0, notaLibre: "3 cdas" },
      { foodGroupClave: "grasa_con_proteina", foodItemNombre: "Almendra", porciones: 1.0, notaLibre: "10 almendras o nueces mixtas" },
      { foodGroupClave: "fruta", porciones: 0.5, notaLibre: "miel al gusto" },
    ],
  },
  {
    nombre: "Protein Premier con manzana y granola",
    alias: ["protein premier", "premier con granola"],
    tipoComida: ["snack"],
    componentes: [
      { foodGroupClave: "aoa_muy_bajo", porciones: 4.0, notaLibre: "1 botecito Protein Premier (30 g de proteína)" },
      { foodGroupClave: "fruta", foodItemNombre: "Manzana chica", porciones: 2.0, notaLibre: "2 tazas picada" },
      { foodGroupClave: "cereal", foodItemNombre: "Granola sin azúcar", porciones: 2.0, notaLibre: "6 cdas" },
      { foodGroupClave: "grasa_con_proteina", foodItemNombre: "Almendra", porciones: 0.5, notaLibre: "5 almendras o mitades de nuez" },
    ],
  },
  {
    // Archivado: Alejandro no come melón (`03-PLAN-NUTRICION.md`, Bloque 2).
    // Mismo trato que pescado y salmón en §10.2 — presente en la base para
    // consulta, ausente de la interfaz. Se usa la Opción 1 o 3 ese día.
    nombre: "Bowl de yogur con melón",
    tipoComida: ["snack"],
    archivado: true,
    componentes: [
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Yogurt griego", porciones: 3.0, notaLibre: "1 taza" },
      { foodGroupClave: "fruta", foodItemNombre: "Melón", porciones: 2.0, notaLibre: "2 tazas" },
      { foodGroupClave: "cereal", foodItemNombre: "Granola sin azúcar", porciones: 2.0, notaLibre: "6 cdas" },
      { foodGroupClave: "grasa_con_proteina", foodItemNombre: "Semillas de chía", porciones: 0.5, notaLibre: "1 cda (alt: nueces mixtas)" },
    ],
  },

  // ── Cena (8:30-9:30 pm) ────────────────────────────────────────────────
  {
    nombre: "Poke bowl",
    alias: ["poke", "poke de pollo"],
    tipoComida: ["cena"],
    componentes: [
      { foodGroupClave: "cereal", foodItemNombre: "Arroz blanco o integral", porciones: 1.5, notaLibre: "1/2 taza" },
      { foodGroupClave: "verdura", foodItemNombre: "Cebolla cocida", porciones: 0.5, notaLibre: "cebolla y cilantro" },
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pechuga de pollo", porciones: 6.0, notaLibre: "180 g" },
      { foodGroupClave: "verdura", foodItemNombre: "Pimiento cocido", porciones: 1.0, notaLibre: "1/2 taza" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 1.5, notaLibre: "1/2 pieza" },
      { foodGroupClave: "libre", porciones: 1.0, notaLibre: "salsa casera o de soya" },
    ],
  },
  {
    nombre: "Ensalada de pollo fría",
    alias: ["ensalada de pollo"],
    tipoComida: ["cena"],
    componentes: [
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pollo desmenuzado", porciones: 6.0, notaLibre: "180 g" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Mayonesa light", porciones: 2.0, notaLibre: "2 cditas" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "1 taza de vegetales mixtos + jugo de limón" },
      { foodGroupClave: "cereal", foodItemNombre: "Elote desgranado", porciones: 1.0, notaLibre: "1/2 taza" },
      { foodGroupClave: "cereal", foodItemNombre: "Tostada de maíz deshidratada", porciones: 2.0, notaLibre: "4 tostadas" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 1.5, notaLibre: "1/2 pieza" },
    ],
  },
  {
    nombre: "Tostadas preparadas de pollo",
    alias: ["tostadas de pollo", "tostadas preparadas"],
    tipoComida: ["cena"],
    componentes: [
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pollo desmenuzado", porciones: 6.0, notaLibre: "180 g en salsa de tomate" },
      { foodGroupClave: "verdura", porciones: 1.0, notaLibre: "salsa de tomate — libre" },
      { foodGroupClave: "cereal", foodItemNombre: "Tostada de maíz deshidratada", porciones: 1.0, notaLibre: "2 tostadas" },
      { foodGroupClave: "leguminosa", foodItemNombre: "Frijoles molidos", porciones: 1.5, notaLibre: "1/2 taza" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 1.5, notaLibre: "1/2 pieza (alt: 1/2 taza de guacamole)" },
      { foodGroupClave: "verdura", foodItemNombre: "Lechuga", porciones: 0.5, notaLibre: "rallada" },
    ],
  },
  {
    nombre: "Tacos de pechuga con ensalada",
    alias: ["tacos de pechuga", "tacos de pollo"],
    tipoComida: ["cena"],
    componentes: [
      { foodGroupClave: "aoa_muy_bajo", foodItemNombre: "Pechuga de pollo", porciones: 6.0, notaLibre: "180 g a la plancha" },
      { foodGroupClave: "verdura", foodItemNombre: "Pimiento cocido", porciones: 1.0, notaLibre: "pimientos de colores" },
      { foodGroupClave: "cereal", foodItemNombre: "Tortilla de maíz", porciones: 2.0, notaLibre: "2 tortillas" },
      { foodGroupClave: "verdura", foodItemNombre: "Lechuga", porciones: 0.5, notaLibre: "1/2 taza de ensalada verde" },
      { foodGroupClave: "grasa_sin_proteina", porciones: 0.5, notaLibre: "2 cditas de aderezo ranch bajo en grasa" },
      { foodGroupClave: "grasa_sin_proteina", foodItemNombre: "Aguacate", porciones: 0.75, notaLibre: "1/4 pieza chica" },
      { foodGroupClave: "grasa_con_proteina", foodItemNombre: "Pistaches sin sal", porciones: 0.5, notaLibre: "10 pistaches" },
    ],
  },
];

/** Nombres del Bloque 1, para que la migración de datos sepa qué archivar. */
export const NOMBRES_BLOQUE_1: string[] = BLOQUE_1.map((d) => d.nombre);

export const DISHES: RawDish[] = [
  ...BLOQUE_1.map((d) => ({ ...d, archivado: true })),
  ...DISHES_BLOQUE_2,
];
