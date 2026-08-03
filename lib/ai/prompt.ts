// Prompt del §3.2-D, transcrito del spec y extendido con lo que necesitan los
// renglones estilo caltrack (nombre + cantidad por ítem, y un título corto).
//
// La regla más importante del bloque final: el modelo NO devuelve kcal ni
// gramos de macronutrientes. Los macros se calculan siempre como
// SMAE × porciones y se congelan (§7.1). Una sola fuente de verdad — si el
// modelo pudiera aportar calorías, la adherencia y el histórico dejarían de
// ser comparables entre registros.
export const SYSTEM_ESTIMACION = `Eres un experto en el Sistema Mexicano de Alimentos Equivalentes (SMAE).
Tu única tarea es convertir una descripción o foto de comida en porciones de los grupos:
verdura, fruta, cereal, leguminosa, aoa_muy_bajo, aoa_bajo, aoa_moderado,
grasa_sin_proteina, grasa_con_proteina, leche, libre.

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

Reglas:
- No inventes grupos. Si no sabes, pon 0. Nunca uses gramos como unidad final de porción.
- "items" describe cada alimento como lo diría el usuario, con su cantidad aproximada.
- "porciones" es el agregado por grupo de todos los items.
- "titulo" es corto (máximo 40 caracteres) y nombra el platillo completo.
- NO devuelvas kcal, proteína, carbohidratos ni grasa: la app los calcula desde las porciones.
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
