import { normalize, tokens } from "@/lib/text";

export interface DishComponentContext {
  foodGroupId: string;
  foodGroupClave: string;
  foodItemId: string | null;
  foodItemNombre: string | null;
  porciones: number;
  /** "138 g cocida", "1/2 pieza" — la cantidad real transcrita del menú. */
  notaLibre: string | null;
  /** "1/3 taza", "30 g" — equivalencia de una porción del ítem del catálogo. */
  cantidadPorcion: string | null;
}

export interface DishMatchContext {
  id: string;
  nombre: string;
  alias: string[];
  vecesUsado: number;
  tipoComida: string[];
  components: DishComponentContext[];
}

export interface DishMatch {
  dish: DishMatchContext;
  score: number;
}

// Paso 2 del §3.2-D: ANTES de llamar al modelo se intenta coincidencia local
// contra Dish.nombre y Dish.alias[]. Si pega, se usa el platillo guardado y
// no se llama al modelo: es más rápido, gratis, más preciso y funciona sin
// conexión. "lo de siempre" no necesita una GPU.
export function matchDishLocal(texto: string, dishes: DishMatchContext[]): DishMatch | null {
  const consulta = normalize(texto);
  if (!consulta) return null;

  const consultaTokens = tokens(texto);
  let mejor: DishMatch | null = null;

  for (const dish of dishes) {
    const candidatos = [dish.nombre, ...dish.alias];

    for (const candidato of candidatos) {
      const norm = normalize(candidato);
      if (!norm) continue;

      // Coincidencia exacta o el alias contenido como frase completa.
      if (norm === consulta) {
        return { dish, score: 1 };
      }
      if (consulta.includes(norm) && norm.length >= 6) {
        const score = 0.95;
        if (!mejor || score > mejor.score) mejor = { dish, score };
        continue;
      }

      // Cobertura de tokens: qué proporción de las palabras del candidato
      // aparece en lo que escribió el usuario.
      const candTokens = tokens(candidato);
      if (candTokens.length === 0) continue;
      const cubiertos = candTokens.filter((t) => consultaTokens.includes(t)).length;
      const score = cubiertos / candTokens.length;
      if (score >= 0.75 && (!mejor || score > mejor.score)) {
        mejor = { dish, score };
      }
    }
  }

  return mejor;
}
