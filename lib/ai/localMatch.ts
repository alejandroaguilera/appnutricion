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

// Palabras que no aportan comida: si lo único que sobra de la descripción son
// éstas, el atleta nombró su platillo y ya. Cualquier otra cosa que sobre sí
// puede ser un alimento, y ahí el atajo local deja de ser seguro.
const RELLENO = new Set([
  "con", "sin", "los", "las", "una", "uno", "unas", "unos", "del", "para", "por",
  "que", "mas", "muy", "algo", "poco", "poquito", "solo", "solamente", "tambien",
  "ademas", "hoy", "ayer", "ahorita", "porcion", "porciones", "plato", "plate",
  "rico", "rica", "buenisimo", "normal", "siempre", "mismo", "misma", "acompanado",
  "comi", "cene", "desayune", "almorce", "merende", "tome", "estoy", "comiendo",
  "cenando", "desayunando", "comida", "cena", "desayuno", "snack",
]);

function esRelleno(t: string): boolean {
  return RELLENO.has(t) || /^\d+$/.test(t);
}

// Paso 2 del §3.2-D: ANTES de llamar al modelo se intenta coincidencia local
// contra Dish.nombre y Dish.alias[]. Si pega, se usa el platillo guardado y
// no se llama al modelo: es más rápido, gratis, más preciso y funciona sin
// conexión. "lo de siempre" no necesita una GPU.
//
// El atajo sustituye la descripción COMPLETA por los componentes del platillo,
// así que solo es correcto cuando la descripción no dice nada más. "Pechuga a
// la plancha con arroz y una michelada" pegaba con el alias "pechuga con arroz"
// (cobertura 3/3) y se registraba como pechuga, arroz, frijoles y brócoli: se
// inventaban dos alimentos y la michelada desaparecía. Si sobra cualquier
// palabra que pueda ser comida, decide el modelo — que igual recibe la lista de
// platillos y puede devolver `platilloCoincidente`.
//
// `exigirDescripcionCompleta: false` para resolver un nombre de platillo que ya
// vino del modelo, donde no hay descripción del atleta que respetar.
export function matchDishLocal(
  texto: string,
  dishes: DishMatchContext[],
  { exigirDescripcionCompleta = true } = {}
): DishMatch | null {
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

  if (!mejor || !exigirDescripcionCompleta) return mejor;

  // Lo que sobra se mide contra el nombre Y todos los alias juntos: "plancha"
  // no es un alimento suelto si el platillo se llama "Pechuga a la plancha…",
  // aunque el alias que ganó la coincidencia fuera el corto.
  const conocidos = new Set([mejor.dish.nombre, ...mejor.dish.alias].flatMap((c) => tokens(c)));
  const sobra = consultaTokens.filter((t) => !conocidos.has(t) && !esRelleno(t));

  return sobra.length > 0 ? null : mejor;
}
