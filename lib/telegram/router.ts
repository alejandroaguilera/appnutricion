import { prisma } from "@/lib/prisma";
import { localDayString } from "@/lib/date";
import { currentSlotForTime } from "@/lib/logic/mealSlot";
import { logEvent, errorInfo } from "@/lib/log";
import {
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  descargarFoto,
  descargarArchivo,
} from "./api";
import {
  proponerRegistro,
  confirmarRegistro,
  leerSesion,
  borrarSesion,
  guardarSesion,
  barrasDelDia,
  botonesAjuste,
  macrosDe,
} from "./registro";
import { estadoDelDia, AYUDA, tarjetaEstimacion, escaparHtml } from "./mensajes";
import { responderPregunta } from "@/lib/ai/chat";
import { leerHistorial, guardarHistorial, olvidarHistorial } from "./chatSesion";
import { AiUnavailableError, MOTIVO_LEGIBLE } from "@/lib/ai/provider";
import { transcribirAudio, transcripcionConfig } from "@/lib/ai/transcribe";
import { enviarAccion } from "./api";
import type { PlanMealSlotClave } from "@prisma/client";

// Una pregunta se contesta, no se registra como comida. Heurística barata: no
// gasta una llamada al modelo solo para adivinar la intención.
// Ojo con `\b` aquí: en regex de JavaScript las vocales acentuadas NO son
// caracteres de palabra, así que `qué\b` no casa con "qué preparo" (entre "é"
// y el espacio no hay frontera). Se usa un lookahead explícito en su lugar.
const ARRANQUE_PREGUNTA =
  /^(qué|que|cuál|cual|cuánt\w*|cuant\w*|cómo|como|dónde|donde|por\s+qué|porque|puedo|debo|sirve|conviene|recomiend\w*|me sugieres|dame|hay algo|está bien|esta bien)(?=\s|$|[?,.])/i;

function pareceConsulta(texto: string): boolean {
  const t = texto.trim();
  if (t.endsWith("?") || t.startsWith("¿")) return true;
  return ARRANQUE_PREGUNTA.test(t);
}

// `/snack` apunta al único tiempo de snack del plan vigente. El Bloque 2 quitó
// `snack_am`, y `registro.ts` resuelve el slot con
// `findFirst({ clave, plan: { activo: true } })`: una clave que el plan no
// tiene devuelve null, así que la entrada se guardaba sin `planMealSlotId` y
// con la clave cruda de nombre. Si algún bloque futuro vuelve a tener dos
// snacks, esto necesita desambiguar por hora, no volver a `snack_am`.
const SLOT_POR_COMANDO: Record<string, PlanMealSlotClave> = {
  desayuno: "desayuno",
  comida: "comida",
  cena: "cena",
  snack: "snack_pm",
  postgym: "post_gym",
};

interface ArchivoTelegram {
  file_id: string;
  file_size?: number;
  mime_type?: string;
  duration?: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    caption?: string;
    photo?: { file_id: string; file_size?: number; width: number; height: number }[];
    /** Nota de voz (el micrófono de Telegram). OGG/Opus. */
    voice?: ArchivoTelegram;
    /** Archivo de audio adjunto (mp3, m4a…). */
    audio?: ArchivoTelegram;
    /** Mensaje redondo de video: se transcribe su pista de audio. */
    video_note?: ArchivoTelegram;
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
}

export async function procesarUpdate(update: TelegramUpdate): Promise<string | null> {
  try {
    if (update.callback_query) return await manejarCallback(update);
    if (update.message) return await manejarMensaje(update);
    return null;
  } catch (err) {
    logEvent("tg_procesar_error", { updateId: update.update_id, ...errorInfo(err) });
    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (chatId) {
      await sendMessage(String(chatId), "Algo falló al procesar eso. Vuelve a intentarlo.");
    }
    throw err;
  }
}

async function manejarMensaje(update: TelegramUpdate): Promise<string | null> {
  const msg = update.message!;
  const chatId = String(msg.chat.id);

  // Una nota de voz se convierte en texto y a partir de ahí recorre EXACTAMENTE
  // el mismo camino que si se hubiera escrito: comandos, heurística de
  // pregunta, slot por hora. Nada duplicado.
  const audio = msg.voice ?? msg.audio ?? msg.video_note;
  if (audio) return await manejarVoz(chatId, msg, audio);

  return await procesarTexto(chatId, msg, (msg.text ?? msg.caption ?? "").trim());
}

async function procesarTexto(
  chatId: string,
  msg: NonNullable<TelegramUpdate["message"]>,
  texto: string
): Promise<string | null> {
  // Comandos que no registran comida.
  if (texto.startsWith("/")) {
    const [crudo, ...resto] = texto.split(/\s+/);
    const comando = crudo.slice(1).split("@")[0].toLowerCase();
    const argumento = resto.join(" ").trim();

    switch (comando) {
      case "ayuda":
      case "start":
        await sendMessage(chatId, AYUDA);
        return null;
      case "hoy":
        await enviarEstado(chatId, localDayString(), "Hoy");
        return null;
      case "ayer":
        await enviarEstado(chatId, restarUnDia(localDayString()), "Ayer");
        return null;
      case "semana":
        await enviarSemana(chatId);
        return null;
      case "platillos":
        await enviarPlatillos(chatId);
        return null;
      case "agua":
        await registrarAgua(chatId, argumento);
        return null;
      case "peso":
        await registrarPeso(chatId, argumento);
        return null;
      case "deshacer":
        await deshacer(chatId);
        return null;
      case "chat": {
        // `/chat` puede venir como pie de una foto ("/chat ¿esto tiene
        // cafeína?"). Antes la foto se tiraba en silencio y el modelo
        // contestaba, con razón, que no veía ningún producto.
        const foto = await bajarFotoDelMensaje(msg);
        if (foto.hay && !foto.imagen) {
          await avisarFotoNoDescargada(chatId);
          return null;
        }
        if (!argumento && !foto.imagen) {
          await sendMessage(chatId, "Pregúntame algo: <code>/chat ¿qué puedo cenar hoy?</code>");
          return null;
        }
        await responderChat(
          chatId,
          argumento || "¿Qué es esto? Descríbelo y dime qué aporta.",
          { imagen: foto.imagen }
        );
        return null;
      }
      case "olvida":
      case "olvidar":
        await olvidarHistorial(chatId);
        await sendMessage(chatId, "Listo, empezamos de cero.");
        return null;
      default: {
        const slot = SLOT_POR_COMANDO[comando];
        if (!slot) {
          await sendMessage(chatId, "No conozco ese comando. /ayuda te dice cuáles hay.");
          return null;
        }
        return await registrarDesdeMensaje(chatId, msg, argumento, slot);
      }
    }
  }

  if (!texto && !msg.photo) return null;

  // Una foto con un pie de foto interrogativo se CONTESTA, no se registra
  // ("¿este producto tiene cafeína?"). Antes toda foto era comida por
  // definición, así que la pregunta se perdía y llegaba una tarjeta de
  // estimación. Siempre se ofrece registrar al final, para no tragarse la
  // otra intención. Foto sin pie, o con descripción normal, sigue siendo
  // comida.
  if (pareceConsulta(texto)) {
    const foto = await bajarFotoDelMensaje(msg);
    if (foto.hay && !foto.imagen) {
      await avisarFotoNoDescargada(chatId);
      return null;
    }
    await responderChat(chatId, texto, {
      // Una pregunta escrita y terminada en "?" es inequívoca; con foto de por
      // medio nunca lo es del todo.
      ofrecerRegistro: foto.hay || !texto.endsWith("?"),
      imagen: foto.imagen,
    });
    return null;
  }

  // Sin comando, la hora decide el slot (§6.5). Siempre modificable en la
  // confirmación.
  return await registrarDesdeMensaje(chatId, msg, texto, currentSlotForTime());
}

// Baja la foto del mensaje sin escribirla en la base: en el camino de consulta
// la foto no es comida y no le toca una fila de `MealPhoto`. `hay` distingue
// "no venía foto" de "venía y no pude bajarla", que antes acababan en el mismo
// sitio — y el segundo caso seguía adelante SIN imagen, con el modelo
// estimando a ciegas.
async function bajarFotoDelMensaje(
  msg: NonNullable<TelegramUpdate["message"]>
): Promise<{ hay: boolean; imagen: { base64: string; mime: string } | null }> {
  if (!msg.photo?.length) return { hay: false, imagen: null };
  const foto = await descargarFoto(msg.photo);
  if (!foto) return { hay: true, imagen: null };
  return { hay: true, imagen: { base64: foto.buffer.toString("base64"), mime: "image/jpeg" } };
}

async function avisarFotoNoDescargada(chatId: string): Promise<void> {
  await sendMessage(
    chatId,
    "No pude bajar la foto de Telegram. Mándamela otra vez, o descríbeme qué es."
  );
}

async function registrarDesdeMensaje(
  chatId: string,
  msg: NonNullable<TelegramUpdate["message"]>,
  texto: string,
  slotClave: PlanMealSlotClave
): Promise<string | null> {
  let fotoId: string | null = null;
  let imagen: { base64: string; mime: string } | null = null;

  if (msg.photo?.length) {
    const foto = await descargarFoto(msg.photo);
    // Si mandó foto y no llegó, se dice. Seguir en silencio dejaba al modelo
    // estimando a ciegas, y eso no falla: devuelve un JSON válido y vacío que
    // se convierte en un registro de 0 kcal.
    //
    // Con descripción de por medio la foto no era lo único que traía, así que
    // se avisa y se estima con el texto — perder también lo escrito sería
    // descartar un registro (§3.2-D).
    if (!foto) {
      if (!texto) {
        await avisarFotoNoDescargada(chatId);
        return null;
      }
      await sendMessage(
        chatId,
        "No pude bajar la foto de Telegram, así que lo estimo con tu descripción."
      );
    } else {
      fotoId = crypto.randomUUID();
      await prisma.mealPhoto.create({
        data: {
          id: fotoId,
          mime: "image/jpeg",
          bytes: foto.buffer.byteLength,
          datos: new Uint8Array(foto.buffer),
          ancho: foto.ancho,
          alto: foto.alto,
          origen: "telegram",
          telegramFileId: foto.fileId,
        },
      });
      imagen = { base64: foto.buffer.toString("base64"), mime: "image/jpeg" };
    }
  }

  await proponerRegistro({ chatId, slotClave, texto: texto || null, fotoId, imagen });
  return null;
}

async function manejarCallback(update: TelegramUpdate): Promise<string | null> {
  const cq = update.callback_query!;
  const chatId = String(cq.message?.chat.id ?? "");
  const data = cq.data ?? "";
  if (!chatId) return null;

  if (data === "noop") {
    await answerCallbackQuery(cq.id);
    return null;
  }

  const sesion = await leerSesion(chatId);
  if (!sesion) {
    await answerCallbackQuery(cq.id, "Esa propuesta ya expiró");
    await sendMessage(chatId, "Esa propuesta expiró. Vuelve a mandarme qué comiste.");
    return null;
  }

  if (data === "cancel") {
    await borrarSesion(chatId);
    await answerCallbackQuery(cq.id, "Cancelado");
    if (cq.message) await editMessageText(chatId, cq.message.message_id, "Cancelado.");
    return null;
  }

  if (data === "conf") {
    await answerCallbackQuery(cq.id);
    await confirmarRegistro(chatId, sesion);
    return null;
  }

  if (data === "ajustar") {
    await answerCallbackQuery(cq.id);
    if (cq.message) {
      await editMessageText(
        chatId,
        cq.message.message_id,
        tarjetaEstimacion({
          slotClave: sesion.slotClave,
          slotNombre: sesion.slotClave,
          estimacion: sesion.estimacion,
          macros: macrosDe(sesion.estimacion),
        }),
        botonesAjuste(sesion.estimacion)
      );
    }
    return null;
  }

  // aj:<grupo>:<+|->  — editar en el chat sin abrir la app (§6.6).
  if (data.startsWith("aj:")) {
    const [, grupo, signo] = data.split(":");
    const delta = signo === "+" ? 0.5 : -0.5;
    const porciones = sesion.estimacion.porciones.map((p) =>
      p.grupo === grupo ? { ...p, porciones: Math.max(0, p.porciones + delta) } : p
    );
    // Los ítems dejan de ser la verdad en cuanto se ajusta por grupo.
    const estimacion = { ...sesion.estimacion, porciones, items: [] };
    await guardarSesion(chatId, { ...sesion, estimacion });
    await answerCallbackQuery(cq.id);
    if (cq.message) {
      await editMessageText(
        chatId,
        cq.message.message_id,
        tarjetaEstimacion({
          slotClave: sesion.slotClave,
          slotNombre: sesion.slotClave,
          estimacion,
          macros: macrosDe(estimacion),
        }),
        botonesAjuste(estimacion)
      );
    }
    return null;
  }

  await answerCallbackQuery(cq.id);
  return null;
}

// ── Notas de voz ───────────────────────────────────────────────────────────

// Números dictados. Red de seguridad: `/v1/stt` con `format=true` ya devuelve
// "500" y "84.3" por su cuenta (normalización inversa de texto), pero de eso
// depende que `/agua quinientos` registre algo o se quede en "dime cuántos
// ml", y no cuesta nada cubrirse. Solo hace falta el rango en el que se habla
// de mililitros y de kilos, así que el mapa es corto a propósito.
const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciséis: 16, dieciseis: 16,
  diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21,
  veintidós: 22, veintidos: 22, veintitrés: 23, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiséis: 26, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30,
  cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80,
  noventa: 90, cien: 100, ciento: 100, doscientos: 200, trescientos: 300,
  cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700,
  ochocientos: 800, novecientos: 900, mil: 1000,
};

// "ochenta y cuatro punto tres" → "84.3"; "mil quinientos" → "1500".
// Se acumula por tramos: al terminar una secuencia de palabras-número se
// emite el total. `mil` multiplica lo acumulado en vez de sumarse.
function normalizarNumeros(texto: string): string {
  const salida: string[] = [];
  let acc: number | null = null;

  const emitir = () => {
    if (acc !== null) salida.push(String(acc));
    acc = null;
  };

  for (const palabra of texto.split(/\s+/)) {
    const limpia = palabra.toLowerCase().replace(/[.,;:!¡?¿]+$/, "");
    const cola = palabra.slice(limpia.length);
    const valor = UNIDADES[limpia];

    if (valor !== undefined) {
      if (limpia === "mil") acc = (acc ?? 1) * 1000;
      else acc = (acc ?? 0) + valor;
      // Si la palabra cerraba con puntuación, el número termina ahí.
      if (cola) {
        salida.push(String(acc) + cola);
        acc = null;
      }
      continue;
    }
    // "y" entre decenas y unidades no rompe el número: ochenta y cuatro.
    if (limpia === "y" && acc !== null) continue;

    emitir();
    salida.push(palabra);
  }
  emitir();

  // "84 punto 3" -> "84.3", ya con los números convertidos a dígitos.
  return salida.join(" ").replace(/(\d)\s+punto\s+(\d)/gi, "$1.$2");
}

// Comandos hablados que NO llevan diagonal. Cada regla es estrecha a
// propósito: mapear "comida" o "agua" a lo bruto secuestraría un registro real
// ("agua de jamaica con la comida" no es `/agua`).
function normalizarComandoHablado(crudo: string): string {
  const texto = crudo.trim();
  const sinPunto = texto.replace(/[.!¡]+$/, "").trim();
  const bajo = sinPunto.toLowerCase();

  // Solos y sin nada más: no hay forma de confundirlos con comida.
  const SOLOS = ["hoy", "ayer", "semana", "platillos", "ayuda", "deshacer"];
  if (SOLOS.includes(bajo)) return `/${bajo}`;

  // "agua quinientos", "peso ochenta y cuatro punto tres". La conversión de
  // números dictados se aplica SOLO aquí: pasarla sobre todo el texto
  // convertiría "un poco de arroz" en "1 poco de arroz". Si no aparece ningún
  // número, no era un comando ("agua de jamaica con la comida" es comida).
  const numerico = sinPunto.match(/^(agua|peso)\b\s*(.+)$/i);
  if (numerico) {
    const valor = normalizarNumeros(numerico[2]).match(/\d+(?:\.\d+)?/);
    if (valor) return `/${numerico[1].toLowerCase()} ${valor[0]}`;
  }

  // "chat, ¿qué ceno?" — forzar la consulta aunque no suene a pregunta.
  const chat = sinPunto.match(/^chat[\s,:]+(.+)$/i);
  if (chat) return `/chat ${chat[1]}`;

  // Un slot solo cuenta como comando si viene separado de lo que sigue:
  // "cena: pollo con arroz". Sin el separador, "comida corrida con agua de
  // jamaica" se convertiría en `/comida corrida…` y perdería la palabra.
  const slot = sinPunto.match(/^(desayuno|comida|cena|snack|post\s*gym)\s*[:,]\s*(.*)$/i);
  if (slot) {
    const clave = slot[1].toLowerCase().replace(/\s+/g, "");
    return `/${clave === "postgym" ? "postgym" : clave} ${slot[2]}`.trim();
  }

  return texto;
}

async function manejarVoz(
  chatId: string,
  msg: NonNullable<TelegramUpdate["message"]>,
  audio: ArchivoTelegram
): Promise<string | null> {
  if (!transcripcionConfig().habilitado) {
    await sendMessage(
      chatId,
      "Todavía no puedo escuchar notas de voz. Escríbeme y lo registro igual."
    );
    return null;
  }

  await enviarAccion(chatId, "typing");

  const archivo = await descargarArchivo(audio.file_id);
  if (!archivo) {
    await sendMessage(chatId, "No pude bajar tu nota de voz. Mándamela otra vez.");
    return null;
  }

  let transcrito: string;
  try {
    // `rutaRemota` trae la extensión que asignó Telegram (.oga en las notas de
    // voz). El contenedor lo autodetecta la propia API, así que el nombre es
    // solo una pista — y una traza legible en los logs.
    const nombre = archivo.rutaRemota.split("/").pop() || "nota.oga";
    const res = await transcribirAudio({ buffer: archivo.buffer, nombre });
    transcrito = res.texto;
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      logEvent("tg_voz_fallida", {
        causa: err.causa,
        detalle: err.detalle,
        segundos: audio.duration,
        bytes: archivo.buffer.byteLength,
      });
      await sendMessage(
        chatId,
        err.causa === "parseo"
          ? "No le entendí a la nota. ¿Me la repites o me lo escribes?"
          : `No pude transcribir tu nota (${MOTIVO_LEGIBLE[err.causa]}). Inténtalo otra vez.`
      );
      return null;
    }
    throw err;
  }

  const normalizado = normalizarComandoHablado(transcrito);

  // El eco no es cortesía: es lo que deja ver qué se entendió ANTES de que
  // llegue la tarjeta de estimación, y sin él un registro por voz es un dato
  // que el atleta no puede auditar.
  await sendMessage(chatId, `🎙 <i>${escaparHtml(transcrito)}</i>`);
  logEvent("tg_voz", { caracteres: transcrito.length, segundos: audio.duration });

  // Desde aquí es idéntico a haberlo escrito.
  return await procesarTexto(chatId, msg, normalizado);
}

// Consulta abierta. Mantiene el hilo 30 min para poder repreguntar ("¿y si no
// tengo pollo?") sin repetir el contexto.
async function responderChat(
  chatId: string,
  pregunta: string,
  opts: { ofrecerRegistro?: boolean; imagen?: { base64: string; mime: string } | null } = {}
): Promise<void> {
  // grok-4.5 tarda 12-20 s; sin la señal de "escribiendo" el chat parece muerto.
  await enviarAccion(chatId, "typing");

  try {
    const historial = await leerHistorial(chatId);
    const res = await responderPregunta({ pregunta, historial, imagen: opts.imagen });
    await guardarHistorial(chatId, res.historial);

    // La heurística puede confundir un registro con una pregunta ("que me comí
    // 3 huevos"). Cuando hay duda se responde Y se ofrece registrar, en vez de
    // tragarse la intención en silencio.
    const coletilla = opts.ofrecerRegistro
      ? "\n\n<i>Si querías registrarlo, escríbelo empezando con /comida o /cena.</i>"
      : "";

    await sendMessage(chatId, escaparHtml(res.texto) + coletilla);
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      logEvent("tg_chat_fallido", { causa: err.causa, detalle: err.detalle, conFoto: Boolean(opts.imagen) });
      await sendMessage(
        chatId,
        `Ahorita no puedo responder consultas (${MOTIVO_LEGIBLE[err.causa]}). Inténtalo en un rato.`
      );
      return;
    }
    throw err;
  }
}

function restarUnDia(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return localDayString(d);
}

async function enviarEstado(chatId: string, fecha: string, titulo: string): Promise<void> {
  const [barras, dia, plan] = await Promise.all([
    barrasDelDia(fecha),
    prisma.dayLog.findUnique({
      where: { fecha: new Date(`${fecha}T00:00:00.000Z`) },
      include: {
        meals: { where: { archivadoEn: null }, include: { portions: true } },
      },
    }),
    prisma.nutritionPlan.findFirst({ where: { activo: true } }),
  ]);

  const portions = dia?.meals.flatMap((m) => m.portions) ?? [];
  await sendMessage(
    chatId,
    estadoDelDia({
      titulo,
      barras,
      kcal: portions.reduce((a, p) => a + p.kcal, 0),
      kcalObjetivo: plan?.kcalObjetivo ?? 0,
      proteinaG: portions.reduce((a, p) => a + p.proteinaG, 0),
      proteinaObjetivo: plan?.proteinaG ?? 0,
      nEntradas: dia?.meals.length ?? 0,
    })
  );
}

async function enviarSemana(chatId: string): Promise<void> {
  const hoy = localDayString();
  const inicio = new Date(`${hoy}T00:00:00.000Z`);
  inicio.setUTCDate(inicio.getUTCDate() - 6);

  const [dias, plan] = await Promise.all([
    prisma.dayLog.findMany({
      where: { fecha: { gte: inicio }, archivadoEn: null },
      include: { meals: { where: { archivadoEn: null }, include: { portions: true } } },
    }),
    prisma.nutritionPlan.findFirst({ where: { activo: true } }),
  ]);

  const conRegistro = dias.filter((d) => d.meals.length > 0);
  if (conRegistro.length === 0) {
    await sendMessage(chatId, "<b>Últimos 7 días</b>\n\nSin registros todavía.");
    return;
  }

  const kcal = conRegistro.map((d) => d.meals.flatMap((m) => m.portions).reduce((a, p) => a + p.kcal, 0));
  const prot = conRegistro.map((d) =>
    d.meals.flatMap((m) => m.portions).reduce((a, p) => a + p.proteinaG, 0)
  );
  const prom = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  await sendMessage(
    chatId,
    `<b>Últimos 7 días</b>\n\n` +
      `Días registrados: ${conRegistro.length} / 7\n` +
      `Promedio: ${Math.round(prom(kcal))} kcal · P ${Math.round(prom(prot))} g\n` +
      `Objetivo: ${Math.round(plan?.kcalObjetivo ?? 0)} kcal · P ${Math.round(plan?.proteinaG ?? 0)} g`
  );
}

async function enviarPlatillos(chatId: string): Promise<void> {
  const dishes = await prisma.dish.findMany({
    where: { archivadoEn: null },
    orderBy: [{ vecesUsado: "desc" }, { nombre: "asc" }],
    take: 30,
  });
  const lineas = dishes.map(
    (d) => `• ${d.nombre}${d.alias.length ? ` <i>(${d.alias.join(", ")})</i>` : ""}`
  );
  await sendMessage(chatId, `<b>Tus platillos</b>\n\n${lineas.join("\n")}`);
}

async function registrarAgua(chatId: string, argumento: string): Promise<void> {
  const ml = Number.parseInt(argumento.replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(ml) || ml <= 0) {
    await sendMessage(chatId, "Dime cuántos ml, por ejemplo <code>/agua 500</code>.");
    return;
  }
  const fecha = localDayString();
  const f = new Date(`${fecha}T00:00:00.000Z`);
  const dia = await prisma.dayLog.upsert({
    where: { fecha: f },
    create: { id: crypto.randomUUID(), fecha: f, aguaMl: ml, sincronizadoEn: new Date(), revision: 1 },
    update: { aguaMl: { increment: ml }, revision: { increment: 1 } },
  });
  await sendMessage(chatId, `Agua: ${((dia.aguaMl ?? 0) / 1000).toFixed(1)} L hoy.`);
}

async function registrarPeso(chatId: string, argumento: string): Promise<void> {
  const kg = Number.parseFloat(argumento.replace(",", "."));
  if (!Number.isFinite(kg) || kg <= 0) {
    await sendMessage(chatId, "Dime el peso, por ejemplo <code>/peso 84.3</code>.");
    return;
  }
  const fecha = localDayString();
  const f = new Date(`${fecha}T00:00:00.000Z`);

  await prisma.weightEntry.upsert({
    where: { fecha_fuente: { fecha: f, fuente: "telegram" } },
    create: { fecha: f, pesoKg: kg, fuente: "telegram" },
    update: { pesoKg: kg },
  });
  await prisma.dayLog.upsert({
    where: { fecha: f },
    create: {
      id: crypto.randomUUID(),
      fecha: f,
      pesoCorporalKg: kg,
      sincronizadoEn: new Date(),
      revision: 1,
    },
    update: { pesoCorporalKg: kg, revision: { increment: 1 } },
  });

  // El peso es canónico en appgym; aquí solo se cachea (§5.1).
  await sendMessage(chatId, `Peso registrado: ${kg} kg. Acuérdate de meterlo también en appgym.`);
}

async function deshacer(chatId: string): Promise<void> {
  const fecha = localDayString();
  const dia = await prisma.dayLog.findUnique({
    where: { fecha: new Date(`${fecha}T00:00:00.000Z`) },
    include: {
      meals: { where: { archivadoEn: null }, orderBy: { horaRegistro: "desc" }, take: 1 },
    },
  });

  const ultima = dia?.meals[0];
  if (!ultima) {
    await sendMessage(chatId, "No hay nada que deshacer hoy.");
    return;
  }

  // Borrado lógico (§5.4.4).
  await prisma.mealEntry.update({
    where: { id: ultima.id },
    data: { archivadoEn: new Date(), version: { increment: 1 } },
  });
  await prisma.dayLog.update({ where: { id: dia!.id }, data: { revision: { increment: 1 } } });

  await sendMessage(chatId, `Quité «${ultima.titulo ?? ultima.clave}».`);
}
