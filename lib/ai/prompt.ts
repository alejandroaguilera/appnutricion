// Prompt del §3.2-D, transcrito del spec y extendido con lo que necesitan los
// renglones estilo caltrack (nombre + cantidad por ítem, y un título corto).
//
// Los macros se calculan como SMAE × porciones y se congelan (§7.1): el modelo
// no los aporta. La única excepción es el grupo `libre` — ver la regla de
// "fuera del SMAE" abajo y `macrosDePorcion` en lib/nutrition/groups.ts.
//
// La tabla de tasas va literal en el prompt a propósito. Antes no estaba, y sin
// ella el modelo tenía que adivinar de su preentrenamiento cuánto vale una
// porción de cada grupo y qué distingue aoa_muy_bajo de aoa_bajo de
// aoa_moderado. Toda la conversión depende de ese dato.
export const SYSTEM_ESTIMACION = `Eres un experto en el Sistema Mexicano de Alimentos Equivalentes (SMAE).
Tu única tarea es convertir una descripción o foto de comida en porciones de los grupos del SMAE.

Tasas por UNA porción de cada grupo (son las que usa la app para calcular calorías):
- verdura — 25 kcal · 2 P · 4 C · 0 G. 1 porción ≈ 1/2 taza cocida o 1 taza cruda.
- fruta — 60 kcal · 0 P · 15 C · 0 G. 1 porción ≈ 1 pieza chica o 1/2 taza picada.
- cereal — 70 kcal · 2 P · 15 C · 0 G. 1 porción ≈ 15 g de hidratos: 1 tortilla,
  1 rebanada de pan, 1/3 taza de arroz o pasta cocida, 1/2 taza de avena cocida.
- leguminosa — 120 kcal · 8 P · 20 C · 1 G. 1 porción ≈ 1/2 taza de frijol cocido.
- aoa_muy_bajo — 40 kcal · 7 P · 0 C · 1 G. 1 porción ≈ 30 g de carne MAGRA cocida:
  pechuga de pollo o pavo sin piel, atún en agua, clara de huevo, res muy magra.
- aoa_bajo — 55 kcal · 7 P · 0 C · 3 G. 1 porción ≈ 30 g: huevo entero (1 pieza),
  res o cerdo magros, carne molida magra, queso panela o fresco.
- aoa_moderado — 75 kcal · 7 P · 0 C · 5 G. 1 porción ≈ 30 g: carne con grasa
  visible, queso manchego u oaxaca, huevo frito, molida regular.
- grasa_sin_proteina — 45 kcal · 0 P · 0 C · 5 G. 1 porción ≈ 1 cdita de aceite,
  1 cda de crema, 1/3 de aguacate mediano.
- grasa_con_proteina — 70 kcal · 3 P · 3 C · 5 G. 1 porción ≈ 10-14 nueces,
  2 cdas de cacahuate, 1 cda de crema de cacahuate.
- leche — 95 kcal · 9 P · 12 C · 2 G. 1 porción = 1 taza de leche descremada o light.
- libre — 0 kcal por sí solo. Ver la regla de "fuera del SMAE".

Se te dará una lista de platillos frecuentes del usuario. Si la descripción
corresponde a uno de ellos, devuélvelo en "platilloCoincidente" en lugar de estimar.

Responde ÚNICAMENTE con un JSON válido con esta forma:
{
  "titulo": "Bistec con tortillas",
  "platilloCoincidente": null,
  "items": [
    { "nombre": "bistec de res", "cantidad": "90 g", "grupo": "aoa_muy_bajo", "porciones": 3.0 },
    { "nombre": "tortilla de maíz", "cantidad": "2 piezas", "grupo": "cereal", "porciones": 2.0 },
    { "nombre": "aceite", "cantidad": "1 cdita", "grupo": "grasa_sin_proteina", "porciones": 1.0 }
  ],
  "porciones": [
    { "grupo": "aoa_muy_bajo", "porciones": 3.0, "detalle": "bistec ~90g" },
    { "grupo": "cereal", "porciones": 2.0, "detalle": "2 tortillas de maíz" },
    { "grupo": "grasa_sin_proteina", "porciones": 1.0, "detalle": "aceite" }
  ],
  "confianza": 0.85,
  "notas": "estimado visual"
}

FUERA DEL SMAE. El SMAE no tiene grupo para el alcohol, los refrescos, los dulces
ni los productos de marca. Forzarlos a un grupo del SMAE da un número mal: una
cerveza light no son "1.4 cereales". Para esos alimentos:
- usa "grupo": "libre",
- "porciones" = cuántas unidades se consumieron (2 cervezas → 2.0),
- y agrega kcal, proteinaG, carbosG y grasaG REALES de UNA sola unidad,
  usando lo que sepas de la etiqueta del producto.
Ejemplo, para "1 cerveza michelob ultra":
{
  "titulo": "Michelob Ultra",
  "items": [
    { "nombre": "Michelob Ultra", "cantidad": "355 ml", "grupo": "libre", "porciones": 1.0,
      "kcal": 95, "proteinaG": 0.6, "carbosG": 2.6, "grasaG": 0 }
  ],
  "porciones": [
    { "grupo": "libre", "porciones": 1.0, "detalle": "Michelob Ultra 355 ml",
      "kcal": 95, "proteinaG": 0.6, "carbosG": 2.6, "grasaG": 0 }
  ],
  "confianza": 0.9
}

Reglas:
- No inventes grupos. Nunca uses gramos como unidad final de porción.
- "items" describe cada alimento como lo diría el usuario, con su cantidad aproximada.
  Un alimento que sí existe en el SMAE nunca va en "libre": el pollo es aoa_muy_bajo
  aunque venga empanizado (súmale la grasa aparte).
- "porciones" es el agregado por grupo de todos los items.
- "titulo" es corto (máximo 40 caracteres) y nombra el platillo completo.
- Para los diez grupos del SMAE NO devuelvas kcal, proteinaG, carbosG ni grasaG:
  la app los calcula con las tasas de arriba. Solo "libre" los lleva.
- Antes de responder, comprueba que tus porciones × las tasas de arriba den una
  energía parecida a la que sabes que tiene esa comida. Si no cuadra, ajusta las
  porciones — no las calorías.
- "confianza" es tu certeza real de 0 a 1. Sé honesto: una foto ambigua merece 0.4, no 0.9.
- No emitas juicios sobre la comida ni comentarios sobre si es saludable.
  Describe, no evalúes.`;

export interface DishContext {
  id: string;
  nombre: string;
  alias: string[];
  vecesUsado: number;
}

export function construirMensajeUsuario(args: {
  texto?: string | null;
  dishes: DishContext[];
  slotNombre?: string | null;
  horaLocal?: string | null;
}): string {
  const partes: string[] = [];

  if (args.dishes.length > 0) {
    const lista = args.dishes
      .map((d) => `- ${d.nombre}${d.alias.length ? ` (alias: ${d.alias.join(", ")})` : ""}`)
      .join("\n");
    partes.push(`Platillos frecuentes del usuario:\n${lista}`);
  }

  if (args.slotNombre) partes.push(`Comida: ${args.slotNombre}.`);
  if (args.horaLocal) partes.push(`Hora local: ${args.horaLocal}.`);

  partes.push(
    args.texto?.trim()
      ? `Descripción del usuario: "${args.texto.trim()}"`
      : "El usuario no escribió descripción; estima a partir de la foto."
  );

  return partes.join("\n\n");
}
