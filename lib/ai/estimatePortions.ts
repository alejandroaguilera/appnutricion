import { aiConfig, xaiChat, AiUnavailableError, type ContenidoUsuario } from "./provider";
import { SYSTEM_ESTIMACION, construirMensajeUsuario } from "./prompt";
import { parseEstimacion, type Estimacion } from "./schema";
import { matchDishLocal, type DishMatchContext } from "./localMatch";
import { logEvent } from "@/lib/log";

export interface EstimateInput {
  texto?: string | null;
  imagen?: { base64: string; mime: string } | null;
  slotNombre?: string | null;
  horaLocal?: string | null;
  dishes: DishMatchContext[]; // los 20 más usados
}

export interface EstimateResult {
  fuente: "catalogo" | "modelo";
  estimacion: Estimacion;
  dishId: string | null;
  crudo: unknown;
  modelo: string | null;
  latenciaMs: number;
}

// Orquestador compartido por la app y por Telegram (§9 fase 11): los dos
// canales tienen que estimar igual, y la regla de "confirmación obligatoria"
// del §3.2 no admite excepciones por canal.
export async function estimatePortions(input: EstimateInput): Promise<EstimateResult> {
  const inicio = Date.now();

  // 1 — Coincidencia local primero. Solo con texto: si hay foto, el usuario
  // quiere que se mire la foto, no que se adivine por el texto.
  if (input.texto && !input.imagen) {
    const match = matchDishLocal(input.texto, input.dishes);
    if (match) {
      logEvent("ia_match_local", { dishId: match.dish.id, score: match.score });
      return {
        fuente: "catalogo",
        dishId: match.dish.id,
        modelo: null,
        crudo: { platilloLocal: match.dish.nombre, score: match.score },
        latenciaMs: Date.now() - inicio,
        estimacion: {
          titulo: match.dish.nombre,
          platilloCoincidente: match.dish.nombre,
          items: match.dish.components.map((c) => ({
            nombre: c.foodItemNombre ?? c.foodGroupClave,
            cantidad: null,
            grupo: c.foodGroupClave as Estimacion["items"][number]["grupo"],
            porciones: c.porciones,
          })),
          porciones: match.dish.components.map((c) => ({
            grupo: c.foodGroupClave as Estimacion["porciones"][number]["grupo"],
            porciones: c.porciones,
            detalle: c.foodItemNombre,
          })),
          confianza: 1,
          notas: "platillo guardado",
        },
      };
    }
  }

  // 2 — Solo si no hay coincidencia se llama al modelo.
  const cfg = aiConfig();
  if (!cfg.habilitado) throw new AiUnavailableError("sin_llave");

  const modelo = (input.imagen ? cfg.modeloVision : cfg.modelo) as string;

  const contenido: ContenidoUsuario[] = [
    {
      type: "text",
      text: construirMensajeUsuario({
        texto: input.texto,
        // Contexto: los 20 platillos más usados, para que prefiera identificar
        // uno existente antes que estimar desde cero (§3.2-D paso 4).
        dishes: input.dishes.slice(0, 20),
        slotNombre: input.slotNombre,
        horaLocal: input.horaLocal,
      }),
    },
  ];
  if (input.imagen) {
    contenido.push({
      type: "image_url",
      image_url: { url: `data:${input.imagen.mime};base64,${input.imagen.base64}`, detail: "high" },
    });
  }

  const res = await xaiChat({ modelo, system: SYSTEM_ESTIMACION, user: contenido });

  let parsed = parseEstimacion(res.contenido);

  // Un solo viaje de reparación. Si vuelve a fallar, la entrada se guarda
  // como `pendiente` río arriba — nunca se descarta el registro (§3.2).
  if (!parsed.ok) {
    logEvent("ia_reparando_json", { issues: parsed.issues });
    const reintento = await xaiChat({
      modelo,
      system: SYSTEM_ESTIMACION,
      user: [
        ...contenido,
        {
          type: "text",
          text: `Tu respuesta anterior no cumplió el esquema (${parsed.issues}). Responde SOLO el JSON corregido.`,
        },
      ],
    });
    parsed = parseEstimacion(reintento.contenido);
    if (!parsed.ok) throw new AiUnavailableError("parseo", parsed.issues);
  }

  // Si el modelo dice haber reconocido un platillo guardado, se resuelve su id.
  const nombreCoincidente = parsed.estimacion.platilloCoincidente;
  const dishId = nombreCoincidente
    ? (matchDishLocal(nombreCoincidente, input.dishes)?.dish.id ?? null)
    : null;

  return {
    fuente: "modelo",
    estimacion: parsed.estimacion,
    dishId,
    crudo: res.crudo,
    modelo: res.modelo,
    latenciaMs: Date.now() - inicio,
  };
}
