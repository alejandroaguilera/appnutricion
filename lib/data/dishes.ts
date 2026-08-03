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
}

// Platillos transcritos de §10.3. Los desayunos y cenas usan los nombres
// literales del spec; los snacks AM/PM y post-gym no traen nombre propio en
// el documento (solo listas de ingredientes) — se les asignó una etiqueta
// descriptiva corta, no una invención de datos nutricionales.
export const DISHES: RawDish[] = [
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
